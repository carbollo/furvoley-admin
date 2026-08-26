'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { normalizeRole } from '@/lib/rbac'
import { runWithTenant } from '@/lib/multitenant/request'
import { sendApiWassText } from '@/lib/apiwass'
import { getClubIssuer } from '@/lib/club-settings'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'
import {
  runPaymentCreatedWorkflows,
  runPaymentPaidWorkflows,
} from '@/lib/workflow-engine'
import { createInvoiceStripeLink } from '@/app/actions/billing'

/**
 * Autorización de estos server actions (endpoints RPC invocables por cualquier
 * cliente autenticado, así que la UI NO basta): contabilidad, pagos y recordatorios
 * requieren ADMIN o TREASURER. Además todo corre en runWithTenant (activa la BD del
 * club por host; los actions no heredan el tenant del render de la página).
 *
 * NOTA: el alta/edición/baja de socios se movió a @/lib/members-service (sin
 * 'use server') para que deje de ser invocable como RPC; lo usan solo las rutas API
 * (requireRoles), el import CSV, las acciones en lote y Hermes (Bearer).
 */
async function assertAccountingStaff() {
  const session = await getServerSession(authOptions)
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role)
  if (!session?.user || (role !== 'ADMIN' && role !== 'TREASURER')) {
    throw new Error('No autorizado')
  }
}

export type PaymentReminderResult = {
  sent: number
  failed: number
  skippedNoPhone: number
  totalMembersInDebt: number
  error?: string
}

export async function sendWhatsAppPaymentReminders(): Promise<PaymentReminderResult> {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  const waCfg = await getWhatsAppConfig()
  const sessionId = String(waCfg.linkedSessionId || process.env.APIWASS_DEFAULT_SESSION_ID || '').trim()
  if (!sessionId) {
    return {
      sent: 0,
      failed: 0,
      skippedNoPhone: 0,
      totalMembersInDebt: 0,
      error:
        'WhatsApp no está configurado. Ve a Ajustes del club y vincula una sesión de ApiWass, o define APIWASS_DEFAULT_SESSION_ID.',
    }
  }

  const openInvoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
    },
    include: { member: true },
    orderBy: { dueDate: 'asc' },
  })

  const issuer = await getClubIssuer()
  const clubName = issuer.name || 'el club'

  const byMember = new Map<
    string,
    {
      memberId: string
      memberName: string
      phone: string | null
      pendingTotal: number
      oldestDueDate: Date
      oldestInvoiceId: string
    }
  >()

  for (const invoice of openInvoices) {
    const pending = Math.max(0, invoice.totalAmount - invoice.paidAmount)
    if (pending <= 0) continue
    // Se recuerdan tanto facturas vencidas como pendientes de cobro (no vencidas),
    // en coherencia con el texto del botón "facturas vencidas o pendientes de cobro".

    const existing = byMember.get(invoice.memberId)
    const phone =
      invoice.member.phone?.trim() ||
      invoice.member.guardianPhone?.trim() ||
      null

    if (!existing) {
      byMember.set(invoice.memberId, {
        memberId: invoice.memberId,
        memberName: invoice.member.name,
        phone,
        pendingTotal: pending,
        oldestDueDate: invoice.dueDate,
        oldestInvoiceId: invoice.id,
      })
      continue
    }

    existing.pendingTotal += pending
    if (invoice.dueDate < existing.oldestDueDate) {
      existing.oldestDueDate = invoice.dueDate
      existing.oldestInvoiceId = invoice.id
    }
    if (!existing.phone && phone) existing.phone = phone
  }

  let sent = 0
  let failed = 0
  let skippedNoPhone = 0

  const members = [...byMember.values()]
  // Envío con concurrencia limitada: antes era 1 a 1 (lento con muchos socios,
  // cada uno generaba además su enlace Stripe en serie). 6 en paralelo acelera
  // mucho sin saturar ApiWass.
  const { mapWithConcurrency } = await import('@/lib/concurrency')
  await mapWithConcurrency(members, 6, async (member) => {
    if (!member.phone) {
      skippedNoPhone++
      return
    }

    let payLine = ''
    try {
      // Siempre por el generador de enlaces: leer aquí un enlace guardado de una
      // pasarela anterior mandaría al socio a pagar donde ya no se concilia.
      const url = await createInvoiceStripeLink(member.oldestInvoiceId)
      if (url) payLine = `\nPagar aquí: ${url}`
    } catch {
      /* enlace opcional */
    }

    const message =
      `Hola ${member.memberName}, te recordamos que tienes cuotas pendientes en ${clubName}.\n` +
      `Importe pendiente: ${member.pendingTotal.toFixed(2)} EUR.\n` +
      `Vencimiento más antiguo: ${member.oldestDueDate.toLocaleDateString('es-ES')}.\n` +
      `Por favor, regulariza el pago lo antes posible. Gracias.${payLine}`

    try {
      await sendApiWassText({
        sessionId,
        phone: member.phone,
        message,
      })
      sent++
    } catch (e) {
      console.warn('[recordar cobros] fallo WhatsApp:', e)
      failed++
    }
  })

  return { sent, failed, skippedNoPhone, totalMembersInDebt: byMember.size }
  })
}

// PAYMENTS
export async function createPayment(data: { memberId: string; amount: number; month: number; year: number; status?: string }) {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  const payment = await prisma.payment.create({ data })
  await runPaymentCreatedWorkflows(payment.id)
  if (payment.status === 'PAID') {
    await runPaymentPaidWorkflows(payment.id)
  }
  revalidatePath('/')
  return payment
  })
}

export async function generateStripeLink(paymentId: string) {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { member: true }
  })

  if (!payment) throw new Error("Payment not found")
  if (payment.stripeUrl) return payment.stripeUrl

  const { getStripe } = await import('@/lib/stripe')
  const { getClubIssuer, getStripeConnectConfig } = await import('@/lib/club-settings')
  const stripe = getStripe()
  const issuer = await getClubIssuer()
  const connect = await getStripeConnectConfig()
  const clubSlug = issuer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'club'

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const amountCents = Math.round(payment.amount * 100)
  const applicationFeeCents = connect.applicationFeePercent > 0
    ? Math.round((amountCents * connect.applicationFeePercent) / 100)
    : 0

  const params = {
    line_items: [
      {
        price_data: {
          currency: 'eur' as const,
          product_data: {
            name: `${issuer.name} · Mensualidad ${payment.month}/${payment.year}`,
            description: `Socio: ${payment.member.name}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment' as const,
    success_url: `${appUrl}/?tab=contabilidad&stripeSuccess=1`,
    cancel_url: `${appUrl}/?tab=contabilidad&stripeCanceled=1`,
    client_reference_id: payment.id,
    metadata: {
      paymentId: payment.id,
      memberId: payment.memberId,
      clubId: clubSlug,
      clubName: issuer.name,
      clubLegalName: issuer.legalName || '',
      clubTaxId: issuer.taxId || '',
      stripeAccount: connect.connectedAccountId || '',
    },
    payment_intent_data: {
      metadata: { paymentId: payment.id, memberId: payment.memberId },
      ...(applicationFeeCents > 0 ? { application_fee_amount: applicationFeeCents } : {}),
    },
  }

  const session = await stripe.checkout.sessions.create(
    params,
    connect.hasConnectedAccount ? { stripeAccount: connect.connectedAccountId } : undefined,
  )

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      stripeUrl: session.url,
      stripeSessionId: session.id
    }
  })

  revalidatePath('/')
  return session.url
  })
}

export async function updatePaymentStatus(id: string, status: string) {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  const before = await prisma.payment.findUnique({
    where: { id },
    select: { status: true },
  })
  await prisma.payment.update({
    where: { id },
    data: {
      status,
      paidAt: status === 'PAID' ? new Date() : null
    }
  })
  if (before?.status !== 'PAID' && status === 'PAID') {
    await runPaymentPaidWorkflows(id)
  }
  revalidatePath('/')
  })
}

// TRANSACTIONS
export async function createTransaction(data: {
  type: string
  amount: number
  description: string
  date?: Date
  bankReference?: string | null
  source?: string
}) {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  const transaction = await prisma.transaction.create({
    data: {
      type: data.type,
      amount: data.amount,
      description: data.description,
      date: data.date ?? new Date(),
      bankReference: data.bankReference ?? null,
      source: data.source ?? 'MANUAL',
    },
  })
  revalidatePath('/accounting')
  return transaction
  })
}

export async function deleteTransaction(id: string) {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  await prisma.transaction.delete({ where: { id } })
  revalidatePath('/accounting')
  })
}

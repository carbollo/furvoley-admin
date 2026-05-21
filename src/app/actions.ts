'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { sendApiWassText } from '@/lib/apiwass'
import { getClubIssuer } from '@/lib/club-settings'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'
import {
  runMemberCreatedWorkflows,
  runMemberStatusChangedWorkflows,
  runMemberUpdatedWorkflows,
  runPaymentCreatedWorkflows,
  runPaymentPaidWorkflows,
} from '@/lib/workflow-engine'
import { createInvoiceStripeLink } from '@/app/actions/billing'
import { ensureMemberStripeCustomer } from '@/lib/stripe-member-customer'

// MEMBERS
export async function createMember(data: {
  name: string
  dni?: string
  birthDate?: Date | null
  email?: string
  phone?: string
  address?: string
  guardianName?: string
  guardianPhone?: string
  sportPreference?: string
  registrationExtra?: Record<string, string> | null
  joinedAt?: Date
  status?: string
}) {
  const { joinedAt, registrationExtra, ...rest } = data
  const defaultPasswordRaw = process.env.MEMBER_DEFAULT_PASSWORD || '12345678'
  const hashedDefaultPassword = await bcrypt.hash(defaultPasswordRaw, 10)
  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        ...rest,
        ...(registrationExtra ? { registrationExtra } : {}),
        ...(joinedAt !== undefined ? { joinedAt } : {}),
      },
    })

    const email = created.email?.trim().toLowerCase()
    if (email) {
      const existing = await tx.user.findUnique({ where: { email } })
      if (!existing) {
        await tx.user.create({
          data: {
            name: created.name,
            email,
            password: hashedDefaultPassword,
            role: 'MEMBER',
            memberId: created.id,
            mustChangePassword: true,
          },
        })
      } else if (existing.role === 'MEMBER' && (!existing.memberId || existing.memberId === created.id)) {
        await tx.user.update({
          where: { id: existing.id },
          data: {
            role: 'MEMBER',
            memberId: created.id,
            password: hashedDefaultPassword,
            mustChangePassword: true,
          },
        })
      } else {
        throw new Error('El email ya está en uso por otra cuenta. Usa otro email para el socio.')
      }
    }
    return created
  })
  void ensureMemberStripeCustomer(member.id).catch(() => {})
  await runMemberCreatedWorkflows(member.id)
  revalidatePath('/')
  return member
}

export async function updateMember(
  id: string,
  data: {
    name?: string
    dni?: string
    birthDate?: Date | null
    email?: string
    phone?: string
    address?: string
    sportPreference?: string | null
    status?: string
  },
) {
  const before = await prisma.member.findUnique({
    where: { id },
    select: { status: true },
  })
  const member = await prisma.member.update({ where: { id }, data })
  await runMemberUpdatedWorkflows(member.id)
  if (before?.status != null && before.status !== member.status) {
    await runMemberStatusChangedWorkflows(member.id, {
      previousStatus: before.status,
      currentStatus: member.status,
    })
  }
  revalidatePath('/')
  return member
}

export async function deleteMember(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({
      where: {
        memberId: id,
        role: { in: ['MEMBER', 'PLAYER'] },
      },
    })
    await tx.user.updateMany({
      where: { memberId: id },
      data: { memberId: null },
    })

    await tx.signupLink.updateMany({
      where: { createdMemberId: id },
      data: { createdMemberId: null },
    })
    await tx.order.updateMany({
      where: { memberId: id },
      data: { memberId: null },
    })

    await tx.teamMember.deleteMany({ where: { memberId: id } })
    await tx.attendance.deleteMany({ where: { memberId: id } })
    await tx.payment.deleteMany({ where: { memberId: id } })
    await tx.reminderLog.deleteMany({ where: { memberId: id } })
    await tx.subscription.deleteMany({ where: { memberId: id } })
    await tx.invoice.deleteMany({ where: { memberId: id } })

    await tx.member.delete({ where: { id } })
  })
  revalidatePath('/')
}

export type PaymentReminderResult = {
  sent: number
  failed: number
  skippedNoPhone: number
  totalMembersInDebt: number
  error?: string
}

export async function sendWhatsAppPaymentReminders(): Promise<PaymentReminderResult> {
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

  const now = new Date()
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

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  for (const invoice of openInvoices) {
    const pending = Math.max(0, invoice.totalAmount - invoice.paidAmount)
    if (pending <= 0) continue
    const dueDay = new Date(invoice.dueDate)
    dueDay.setHours(0, 0, 0, 0)
    const isDue = invoice.status === 'OVERDUE' || dueDay <= todayStart
    if (!isDue) continue

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

  for (const member of byMember.values()) {
    if (!member.phone) {
      skippedNoPhone++
      continue
    }

    let payLine = ''
    try {
      const url =
        (await prisma.invoice.findUnique({
          where: { id: member.oldestInvoiceId },
          select: { stripeCheckoutUrl: true },
        }))?.stripeCheckoutUrl || (await createInvoiceStripeLink(member.oldestInvoiceId))
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
  }

  return { sent, failed, skippedNoPhone, totalMembersInDebt: byMember.size }
}

// PAYMENTS
export async function createPayment(data: { memberId: string; amount: number; month: number; year: number; status?: string }) {
  const payment = await prisma.payment.create({ data })
  await runPaymentCreatedWorkflows(payment.id)
  if (payment.status === 'PAID') {
    await runPaymentPaidWorkflows(payment.id)
  }
  revalidatePath('/')
  return payment
}

export async function generateStripeLink(paymentId: string) {
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

  const updatedPayment = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      stripeUrl: session.url,
      stripeSessionId: session.id
    }
  })

  revalidatePath('/')
  return session.url
}

export async function updatePaymentStatus(id: string, status: string) {
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
}

export async function deleteTransaction(id: string) {
  await prisma.transaction.delete({ where: { id } })
  revalidatePath('/accounting')
}

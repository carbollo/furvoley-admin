'use server'

import { prisma } from '@/lib/prisma'
import { buildReminderMessage } from '@/lib/reminder-message'
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
import { createInvoicePaymentLink } from '@/app/actions/billing'

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
      /** El teléfono es del tutor: el mensaje no puede tutear al menor. */
      paraTutor: boolean
      pendingTotal: number
      oldestDueDate: Date
      oldestInvoiceId: string
      oldestInvoiceNumber: string
      recibos: { invoiceNumber: string; pending: number; dueDate: Date; currency: string }[]
    }
  >()

  for (const invoice of openInvoices) {
    const pending = Math.max(0, invoice.totalAmount - invoice.paidAmount)
    if (pending <= 0) continue
    // Se recuerdan tanto facturas vencidas como pendientes de cobro (no vencidas),
    // en coherencia con el texto del botón "facturas vencidas o pendientes de cobro".

    const existing = byMember.get(invoice.memberId)
    const propio = invoice.member.phone?.trim() || ''
    const phone = propio || invoice.member.guardianPhone?.trim() || null
    // Si el número es el del tutor, el mensaje NO puede tutear al menor: acaba
    // en el móvil de su madre o su padre.
    const paraTutor = !propio && Boolean(invoice.member.guardianPhone?.trim())
    const recibo = {
      invoiceNumber: invoice.invoiceNumber,
      pending,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
    }

    if (!existing) {
      byMember.set(invoice.memberId, {
        memberId: invoice.memberId,
        memberName: invoice.member.name,
        phone,
        paraTutor,
        pendingTotal: pending,
        oldestDueDate: invoice.dueDate,
        oldestInvoiceId: invoice.id,
        oldestInvoiceNumber: invoice.invoiceNumber,
        recibos: [recibo],
      })
      continue
    }

    existing.pendingTotal += pending
    existing.recibos.push(recibo)
    if (invoice.dueDate < existing.oldestDueDate) {
      existing.oldestDueDate = invoice.dueDate
      existing.oldestInvoiceId = invoice.id
      existing.oldestInvoiceNumber = invoice.invoiceNumber
    }
    if (!existing.phone && phone) {
      existing.phone = phone
      existing.paraTutor = paraTutor
    }
  }

  let sent = 0
  let failed = 0
  let skippedNoPhone = 0

  const members = [...byMember.values()]
  // Envío con concurrencia limitada: antes era 1 a 1 (lento con muchos socios,
  // cada uno generaba además su enlace de pago en serie). 6 en paralelo acelera
  // mucho sin saturar ApiWass.
  const { mapWithConcurrency } = await import('@/lib/concurrency')
  await mapWithConcurrency(members, 6, async (member) => {
    if (!member.phone) {
      skippedNoPhone++
      return
    }

    let payUrl: string | null = null
    try {
      // Siempre por el generador de enlaces: leer aquí un enlace guardado de una
      // pasarela anterior mandaría al socio a pagar donde ya no se concilia.
      payUrl = (await createInvoicePaymentLink(member.oldestInvoiceId)) || null
    } catch {
      /* enlace opcional */
    }

    // El MISMO texto que los otros dos caminos de aviso. Este se había quedado
    // con una redacción propia que tuteaba al menor en el móvil del tutor y
    // anunciaba la deuda total junto a un enlace que solo pagaba un recibo: la
    // familia pagaba, creía haber terminado y el socio seguía en Impagos.
    const message = buildReminderMessage({
      payUrl,
      memberName: member.memberName,
      clubName,
      toGuardian: member.paraTutor,
      invoices: member.recibos,
      linkCoversInvoiceNumber: member.oldestInvoiceNumber,
    })

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


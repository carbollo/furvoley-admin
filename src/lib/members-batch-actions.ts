import { updateMember } from '@/app/actions'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { sendApiWassText } from '@/lib/apiwass'
import { getClubIssuer } from '@/lib/club-settings'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'
import { createInvoiceStripeLink, createSubscription } from '@/app/actions/billing'

export const MAX_BATCH_MEMBERS = 200

const ALLOWED_STATUS = new Set(['ACTIVE', 'INACTIVE', 'PAUSED', 'PENDING_PAYMENT', 'LEAD'])

export type BatchAction =
  | 'delete'
  | 'reset-portal-access'
  | 'set-status'
  | 'send-payment-reminder'
  | 'assign-plan'

export type BatchOptions = {
  status?: string
  planId?: string
  startDate?: string
  autoPay?: boolean
  paymentRequiredOnEnrollment?: boolean
}

export type BatchMemberResult = {
  ok: boolean
  processed: number
  succeeded: number
  failed: number
  errors: { id: string; message: string }[]
  details?: Record<string, unknown>
}

async function deleteMemberRecord(memberId: string) {
  return prisma.$transaction(async (tx) => {
    const member = await tx.member.findUnique({
      where: { id: memberId },
      select: { id: true },
    })
    if (!member) return { memberDeleted: 0 }

    await tx.user.deleteMany({
      where: { memberId, role: { in: ['MEMBER', 'PLAYER'] } },
    })
    await tx.user.updateMany({ where: { memberId }, data: { memberId: null } })
    await tx.signupLink.updateMany({ where: { createdMemberId: memberId }, data: { createdMemberId: null } })
    await tx.order.updateMany({ where: { memberId }, data: { memberId: null } })
    await tx.teamMember.deleteMany({ where: { memberId } })
    await tx.attendance.deleteMany({ where: { memberId } })
    await tx.payment.deleteMany({ where: { memberId } })
    await tx.reminderLog.deleteMany({ where: { memberId } })
    await tx.subscription.deleteMany({ where: { memberId } })
    await tx.invoice.deleteMany({ where: { memberId } })
    const deletedMember = await tx.member.deleteMany({ where: { id: memberId } })
    return { memberDeleted: deletedMember.count }
  })
}

async function resetPortalAccess(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, email: true, name: true },
  })
  if (!member) throw new Error('Socio no encontrado')
  const email = member.email?.trim().toLowerCase()
  if (!email) throw new Error('Sin email')

  const defaultPassword = process.env.MEMBER_DEFAULT_PASSWORD || '12345678'
  const password = await bcrypt.hash(defaultPassword, 10)

  await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } })
    if (!existing) {
      await tx.user.create({
        data: {
          name: member.name,
          email,
          role: 'MEMBER',
          memberId: member.id,
          password,
          mustChangePassword: true,
        },
      })
      return
    }
    if (existing.role !== 'MEMBER' && existing.memberId !== member.id) {
      throw new Error('Email ya usado por otra cuenta')
    }
    await tx.user.update({
      where: { id: existing.id },
      data: {
        role: 'MEMBER',
        memberId: member.id,
        password,
        mustChangePassword: true,
      },
    })
  })
}

async function sendPaymentReminder(memberId: string) {
  const waCfg = await getWhatsAppConfig()
  const sessionId = String(waCfg.linkedSessionId || process.env.APIWASS_DEFAULT_SESSION_ID || '').trim()
  if (!sessionId) throw new Error('WhatsApp no configurado')

  const openInvoices = await prisma.invoice.findMany({
    where: {
      memberId,
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
    },
    include: { member: true },
    orderBy: { dueDate: 'asc' },
  })

  let pendingTotal = 0
  let oldestDueDate: Date | null = null
  let oldestInvoiceId: string | null = null

  for (const invoice of openInvoices) {
    const pending = Math.max(0, invoice.totalAmount - invoice.paidAmount)
    if (pending <= 0) continue
    // Vencidas o pendientes de cobro (coherente con "Recordar cobros").
    pendingTotal += pending
    if (!oldestDueDate || invoice.dueDate < oldestDueDate) {
      oldestDueDate = invoice.dueDate
      oldestInvoiceId = invoice.id
    }
  }

  if (pendingTotal <= 0 || !oldestInvoiceId || !oldestDueDate) {
    throw new Error('Sin cuotas vencidas o pendientes')
  }

  const member = openInvoices[0]?.member
  const phone = member?.phone?.trim() || member?.guardianPhone?.trim() || ''
  if (!phone) throw new Error('Sin teléfono')

  const issuer = await getClubIssuer()
  const clubName = issuer.name || 'el club'

  let payLine = ''
  try {
    const url =
      (await prisma.invoice.findUnique({
        where: { id: oldestInvoiceId },
        select: { stripeCheckoutUrl: true },
      }))?.stripeCheckoutUrl || (await createInvoiceStripeLink(oldestInvoiceId))
    if (url) payLine = `\nPagar aquí: ${url}`
  } catch {
    /* optional */
  }

  const message =
    `Hola ${member?.name || 'socio'}, te recordamos que tienes cuotas pendientes en ${clubName}.\n` +
    `Importe pendiente: ${pendingTotal.toFixed(2)} EUR.\n` +
    `Vencimiento más antiguo: ${oldestDueDate.toLocaleDateString('es-ES')}.\n` +
    `Por favor, regulariza el pago lo antes posible. Gracias.${payLine}`

  await sendApiWassText({ sessionId, phone, message })
}

async function assignPlanToMember(memberId: string, options: BatchOptions) {
  const planId = String(options.planId || '').trim()
  if (!planId) throw new Error('Plan no indicado')

  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } })
  if (!member) throw new Error('Socio no encontrado')

  let startDate: Date | undefined
  if (options.startDate) {
    const d = new Date(options.startDate)
    if (Number.isNaN(d.getTime())) throw new Error('Fecha de inicio inválida')
    startDate = d
  }

  // Cancela la suscripción activa anterior (mismo comportamiento que el alta individual).
  await prisma.subscription.updateMany({
    where: { memberId, status: 'ACTIVE' },
    data: { status: 'CANCELED', endDate: new Date() },
  })

  await createSubscription({
    memberId,
    planId,
    startDate,
    autoPay: options.autoPay === true,
    paymentRequiredOnEnrollment: options.paymentRequiredOnEnrollment,
  })
}

export async function runMembersBatchAction(
  memberIds: string[],
  action: BatchAction,
  options?: BatchOptions,
): Promise<BatchMemberResult> {
  const uniqueIds = [...new Set(memberIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    return { ok: false, processed: 0, succeeded: 0, failed: 0, errors: [{ id: '', message: 'Sin socios seleccionados' }] }
  }
  if (uniqueIds.length > MAX_BATCH_MEMBERS) {
    return {
      ok: false,
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [{ id: '', message: `Máximo ${MAX_BATCH_MEMBERS} socios por acción` }],
    }
  }

  if (action === 'set-status') {
    const status = String(options?.status || '').trim()
    if (!ALLOWED_STATUS.has(status)) {
      return { ok: false, processed: 0, succeeded: 0, failed: 0, errors: [{ id: '', message: 'Estado no válido' }] }
    }
  }

  if (action === 'assign-plan') {
    const planId = String(options?.planId || '').trim()
    if (!planId) {
      return { ok: false, processed: 0, succeeded: 0, failed: 0, errors: [{ id: '', message: 'Selecciona una cuota' }] }
    }
  }

  const errors: { id: string; message: string }[] = []
  let succeeded = 0

  for (const id of uniqueIds) {
    try {
      if (action === 'delete') {
        const result = await deleteMemberRecord(id)
        if (!result.memberDeleted) throw new Error('No encontrado')
      } else if (action === 'reset-portal-access') {
        await resetPortalAccess(id)
      } else if (action === 'set-status') {
        await updateMember(id, { status: options!.status! })
      } else if (action === 'send-payment-reminder') {
        await sendPaymentReminder(id)
      } else if (action === 'assign-plan') {
        await assignPlanToMember(id, options || {})
      }
      succeeded++
    } catch (e) {
      errors.push({ id, message: e instanceof Error ? e.message : 'Error' })
    }
  }

  return {
    ok: errors.length === 0,
    processed: uniqueIds.length,
    succeeded,
    failed: errors.length,
    errors,
  }
}

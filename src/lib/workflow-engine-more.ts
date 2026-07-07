import { prisma } from '@/lib/prisma'
import { sendApiWassText } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'
import { createInvoiceStripeLink, createInvoiceForSubscription, createSubscription } from '@/app/actions/billing'
import { signupUrlFromToken } from '@/lib/signup-url'
import {
  createWorkflowResponseLink,
  type WorkflowLinkType,
} from '@/lib/workflow-response-links'
import { getClubIssuer } from '@/lib/club-settings'
import type { WorkflowMemberPayload } from '@/lib/workflow-engine'

type WorkflowRunContext = {
  variables: Record<string, string>
  teamNameCache: Map<string, string>
}

function readString(config: unknown, key: string): string | null {
  if (!config || typeof config !== 'object') return null
  const raw = (config as Record<string, unknown>)[key]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function readNumber(config: unknown, key: string): number | null {
  const value = readString(config, key)
  if (!value) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function readBoolean(config: unknown, key: string, defaultValue: boolean): boolean {
  if (!config || typeof config !== 'object') return defaultValue
  const raw = (config as Record<string, unknown>)[key]
  if (typeof raw === 'boolean') return raw
  if (raw === 'true' || raw === true) return true
  if (raw === 'false' || raw === false) return false
  return defaultValue
}

export function buildInvoiceVariables(invoice: {
  id: string
  invoiceNumber: string
  totalAmount: number
  paidAmount: number
  currency: string
  status: string
  dueDate: Date
  stripeCheckoutUrl: string | null
}) {
  const pending = Math.max(0, invoice.totalAmount - invoice.paidAmount)
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceTotal: String(invoice.totalAmount),
    invoiceCurrency: invoice.currency,
    pendingAmount: pending.toFixed(2),
    invoiceStatus: invoice.status,
    invoiceDueDate: invoice.dueDate.toISOString(),
    paymentUrl: invoice.stripeCheckoutUrl || '',
    invoicePdfUrl: `${appUrl}/api/invoices/${invoice.id}/pdf`,
  }
}

export async function runExtendedWorkflowAction(
  step: { actionType: string; config: unknown },
  member: WorkflowMemberPayload,
  runContext: WorkflowRunContext,
  interpolate: (template: string, member: WorkflowMemberPayload, ctx?: WorkflowRunContext) => string,
): Promise<boolean> {
  const setStepError = (message: string) => {
    runContext.variables.stepError = String(message || '').trim()
    runContext.variables.stepApplied = 'false'
  }
  const setStepApplied = () => {
    runContext.variables.stepApplied = 'true'
    runContext.variables.stepError = ''
  }

  async function resolveWorkflowWhatsAppSessionId(explicitSessionId?: string) {
    const explicit = String(explicitSessionId || '').trim()
    if (explicit) return explicit
    const cfg = await getWhatsAppConfig()
    return String(cfg.linkedSessionId || '').trim() || undefined
  }

  if (step.actionType === 'CREATE_INVITE_SIGNUP_LINK') {
    const maxUses = Math.max(1, Math.trunc(readNumber(step.config, 'maxUses') ?? 1))
    const expiresInDays = Math.max(1, Math.trunc(readNumber(step.config, 'expiresInDays') ?? 14))
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    const token = crypto.randomUUID().replace(/-/g, '')
    const link = await prisma.signupLink.create({
      data: { token, maxUses, expiresAt },
    })
    runContext.variables.stepCreatedSignupLinkId = link.id
    runContext.variables.stepCreatedSignupLinkToken = link.token
    runContext.variables.signupLinkUrl = signupUrlFromToken(link.token)
    runContext.variables.stepCreatedSignupLinkExpiresAt = link.expiresAt
      ? link.expiresAt.toISOString()
      : ''
    setStepApplied()
    return true
  }

  if (step.actionType === 'SEND_WHATSAPP_TO_TEAM') {
    const groupId =
      readString(step.config, 'groupId') ||
      runContext.variables.assignedTeamId ||
      runContext.variables.teamAssignedId
    const messageTpl = readString(step.config, 'waMessage') || ''
    if (!groupId || !messageTpl.trim()) {
      setStepError('groupId o mensaje vacío')
      return true
    }
    const message = interpolate(messageTpl, member, runContext)
    const sessionId = await resolveWorkflowWhatsAppSessionId(
      readString(step.config, 'waSessionId') || undefined,
    )
    const members = await prisma.groupMembership.findMany({
      where: { groupId },
      include: { member: { select: { phone: true, guardianPhone: true } } },
    })
    let sent = 0
    for (const tm of members) {
      const phone = (tm.member.guardianPhone || tm.member.phone || '').replace(/[^\d+]/g, '')
      if (!phone) continue
      try {
        await sendApiWassText({ sessionId, phone, message })
        sent++
      } catch (e) {
        console.warn('[workflow] SEND_WHATSAPP_TO_TEAM fallo:', e)
      }
    }
    runContext.variables.stepWhatsAppSent = sent > 0 ? 'true' : 'false'
    if (sent > 0) setStepApplied()
    else setStepError('sin teléfonos en el equipo')
    return true
  }

  if (step.actionType === 'SEND_WHATSAPP_TO_COACH') {
    const groupId =
      readString(step.config, 'groupId') ||
      runContext.variables.rosterTeamId ||
      runContext.variables.assignedTeamId ||
      runContext.variables.teamAssignedId
    const messageTpl = readString(step.config, 'waMessage') || ''
    if (!groupId || !messageTpl.trim()) {
      setStepError('groupId o mensaje vacío')
      return true
    }
    const message = interpolate(messageTpl, member, runContext)
    const sessionId = await resolveWorkflowWhatsAppSessionId(
      readString(step.config, 'waSessionId') || undefined,
    )
    const coachLink = await prisma.groupMembership.findFirst({
      where: { groupId, role: 'COACH' },
      include: { member: { select: { phone: true, guardianPhone: true, name: true } } },
    })
    const phone = (
      coachLink?.member.phone ||
      coachLink?.member.guardianPhone ||
      ''
    ).replace(/[^\d+]/g, '')
    if (!phone) {
      setStepError('entrenador sin teléfono')
      runContext.variables.stepWhatsAppSent = 'false'
      return true
    }
    try {
      await sendApiWassText({ sessionId, phone, message })
      runContext.variables.stepWhatsAppSent = 'true'
      runContext.variables.stepSentWhatsAppPhone = phone
      runContext.variables.stepSentWhatsAppMessage = message
      setStepApplied()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error whatsapp'
      runContext.variables.stepWhatsAppSent = 'false'
      setStepError(msg)
      console.warn('[workflow] SEND_WHATSAPP_TO_COACH fallo:', e)
    }
    return true
  }

  if (step.actionType === 'SEND_PAYMENT_LINK') {
    const invoiceId = runContext.variables.invoiceId
    if (!invoiceId) {
      setStepError('sin invoiceId en contexto')
      return true
    }
    try {
      const url = await createInvoiceStripeLink(invoiceId)
      if (url) runContext.variables.paymentUrl = url
      setStepApplied()
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'error enlace pago')
    }
    return true
  }

  if (step.actionType === 'SEND_INVOICE_PDF_WHATSAPP') {
    const invoiceId = runContext.variables.invoiceId
    const phoneTpl = readString(step.config, 'waPhone') || '{memberPhone}'
    const messageTpl =
      readString(step.config, 'waMessage') ||
      'Factura {invoiceNumber}. PDF: {invoicePdfUrl} Pago: {paymentUrl}'
    const phone = interpolate(phoneTpl, member, runContext).replace(/[^\d+]/g, '')
    let message = interpolate(messageTpl, member, runContext)
    if (invoiceId && !runContext.variables.paymentUrl) {
      try {
        const url = await createInvoiceStripeLink(invoiceId)
        if (url) {
          runContext.variables.paymentUrl = url
          message = interpolate(messageTpl, member, runContext)
        }
      } catch {
        /* optional */
      }
    }
    if (!phone || !message.trim()) {
      setStepError('phone/message vacío')
      return true
    }
    try {
      const sessionId = await resolveWorkflowWhatsAppSessionId(
        readString(step.config, 'waSessionId') || undefined,
      )
      await sendApiWassText({ sessionId, phone, message })
      setStepApplied()
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'error whatsapp')
    }
    return true
  }

  if (step.actionType === 'CREATE_SUBSCRIPTION') {
    const planId = readString(step.config, 'planId')
    if (!planId) {
      setStepError('planId vacío')
      return true
    }
    try {
      const rawRequired = readString(step.config, 'paymentRequiredOnEnrollment')
      const paymentRequiredOnEnrollment =
        rawRequired === 'true' ? true : rawRequired === 'false' ? false : undefined
      const sub = await createSubscription({
        memberId: member.id,
        planId,
        autoPay: readString(step.config, 'autoPay') === 'true',
        paymentRequiredOnEnrollment,
      })
      runContext.variables.subscriptionId = sub.id
      setStepApplied()
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'error suscripción')
    }
    return true
  }

  if (step.actionType === 'CREATE_INVOICE_FROM_PLAN') {
    const subscriptionId = readString(step.config, 'subscriptionId') || runContext.variables.subscriptionId
    if (!subscriptionId) {
      setStepError('subscriptionId vacío')
      return true
    }
    try {
      const invoice = await createInvoiceForSubscription(subscriptionId)
      Object.assign(runContext.variables, buildInvoiceVariables(invoice))
      setStepApplied()
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'error factura')
    }
    return true
  }

  if (step.actionType === 'GENERATE_RESPONSE_LINK') {
    const linkType = (readString(step.config, 'linkType') || 'ATTENDANCE') as WorkflowLinkType
    try {
      const link = await createWorkflowResponseLink({
        type: linkType,
        memberId: member.id !== 'event' && member.id !== 'schedule' ? member.id : null,
        eventId: runContext.variables.eventId || null,
        groupId:
          runContext.variables.groupId ||
          runContext.variables.scheduleTeamId ||
          runContext.variables.rosterTeamId ||
          null,
        expiresInHours: readNumber(step.config, 'expiresInHours') ?? 72,
      })
      runContext.variables.responseLink = link.url
      runContext.variables.responseLinkToken = link.token
      setStepApplied()
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'error enlace')
    }
    return true
  }

  if (step.actionType === 'APPLY_DISCOUNT_RULES') {
    const invoiceId = runContext.variables.invoiceId
    if (!invoiceId) {
      setStepError('sin invoiceId')
      return true
    }
    const rules = await prisma.discountRule.findMany({ where: { isActive: true } })
    if (rules.length === 0) {
      setStepApplied()
      return true
    }
    let siblings = 0
    const phone = member.guardianPhone || member.phone
    if (phone) {
      siblings = await prisma.member.count({
        where: {
          id: { not: member.id },
          status: 'ACTIVE',
          OR: [{ guardianPhone: phone }, { phone }],
        },
      })
    }
    let percent = 0
    for (const r of rules) {
      if (r.ruleType === 'SIBLING' && siblings > 0) percent = Math.max(percent, r.percent)
    }
    if (percent > 0) {
      const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } })
      if (inv && inv.status === 'PENDING') {
        const discount = Math.round(inv.totalAmount * (percent / 100) * 100) / 100
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            totalAmount: Math.max(0, inv.totalAmount - discount),
            subtotal: Math.max(0, inv.subtotal - discount),
          },
        })
        runContext.variables.discountApplied = String(discount)
      }
    }
    setStepApplied()
    return true
  }

  if (step.actionType === 'RETRY_PAYMENT') {
    setStepApplied()
    runContext.variables.retryScheduled = 'true'
    return true
  }

  if (step.actionType === 'SEND_OVERDUE_REPORT') {
    const club = await getClubIssuer()
    const overdue = await prisma.invoice.findMany({
      where: { status: { in: ['OVERDUE', 'PENDING'] }, dueDate: { lt: new Date() } },
      take: 20,
      include: { member: { select: { name: true } } },
    })
    const summary = overdue
      .map((i) => `${i.member.name}: ${i.invoiceNumber} ${i.totalAmount - i.paidAmount}€`)
      .join('\n')
    const phone = club.contactPhone?.replace(/[^\d+]/g, '') || ''
    if (phone && summary) {
      try {
        const sessionId = await resolveWorkflowWhatsAppSessionId(undefined)
        await sendApiWassText({
          sessionId,
          phone,
          message: `Impagos (${overdue.length}):\n${summary}`,
        })
      } catch (e) {
        console.warn('[workflow] SEND_OVERDUE_REPORT:', e)
      }
    }
    setStepApplied()
    return true
  }

  if (step.actionType === 'CALCULATE_PRORATED_REFUND') {
    runContext.variables.proratedRefundNote = 'Revisar devolución en panel de facturación'
    setStepApplied()
    return true
  }

  if (step.actionType === 'CANCEL_SUBSCRIPTION') {
    const sub = await prisma.subscription.findFirst({
      where: { memberId: member.id, status: 'ACTIVE' },
    })
    if (sub) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'CANCELED', endDate: new Date() },
      })
    }
    setStepApplied()
    return true
  }

  if (step.actionType === 'TRIGGER_WAITLIST_NOTIFY') {
    const { runWaitlistSlotWorkflows } = await import('@/lib/workflow-proclub-runners')
    await runWaitlistSlotWorkflows()
    setStepApplied()
    return true
  }

  if (step.actionType === 'GENERATE_TEAM_SESSIONS') {
    // Los horarios fijos autogenerados se eliminaron al pasar de equipos a
    // grupos; el calendario se gestiona ahora con eventos manuales.
    setStepError('La generación automática de sesiones ya no está disponible')
    return true
  }

  return false
}

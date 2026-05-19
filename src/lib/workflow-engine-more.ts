import { prisma } from '@/lib/prisma'
import { sendApiWassText } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'
import { createInvoiceStripeLink, createInvoiceForSubscription, createSubscription } from '@/app/actions/billing'
import { generateTeamSessionsFromSchedule } from '@/lib/team-calendar'
import { signupUrlFromToken } from '@/lib/signup-url'
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
    const teamId = readString(step.config, 'teamId')
    const messageTpl = readString(step.config, 'waMessage') || ''
    if (!teamId || !messageTpl.trim()) {
      setStepError('teamId o mensaje vacío')
      return true
    }
    const message = interpolate(messageTpl, member, runContext)
    const sessionId = await resolveWorkflowWhatsAppSessionId(
      readString(step.config, 'waSessionId') || undefined,
    )
    const members = await prisma.teamMember.findMany({
      where: { teamId },
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
      const sub = await createSubscription({
        memberId: member.id,
        planId,
        autoPay: readString(step.config, 'autoPay') === 'true',
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

  if (step.actionType === 'GENERATE_TEAM_SESSIONS') {
    const teamId = readString(step.config, 'teamId')
    if (!teamId) {
      setStepError('teamId vacío')
      return true
    }
    try {
      const result = await generateTeamSessionsFromSchedule({
        teamId,
        weeksAhead: readNumber(step.config, 'weeksAhead') ?? 4,
      })
      runContext.variables.sessionsGenerated = String(result.created)
      setStepApplied()
    } catch (e) {
      setStepError(e instanceof Error ? e.message : 'error calendario')
    }
    return true
  }

  return false
}

import { AsyncLocalStorage } from 'node:async_hooks'
import { prisma } from '@/lib/prisma'
import { getClubIssuer } from '@/lib/club-settings'
import { effectiveGroupMemberIds } from '@/lib/groups'
import {
  runWorkflowsForMemberByTrigger,
  runWorkflowStepsForMember,
  type WorkflowMemberPayload,
  type WorkflowTriggerType,
} from '@/lib/workflow-engine'
import { createInvoiceForSubscription } from '@/app/actions/billing'

function workflowMatchesTrigger(
  workflow: { triggerType: string; triggerConfig: unknown },
  triggerType: string,
) {
  if (workflow.triggerType === triggerType) return true
  const cfg =
    workflow.triggerConfig && typeof workflow.triggerConfig === 'object'
      ? (workflow.triggerConfig as { eventKinds?: string[] })
      : {}
  return Array.isArray(cfg.eventKinds) && cfg.eventKinds.includes(triggerType)
}

async function loadMemberPayload(memberId: string): Promise<WorkflowMemberPayload | null> {
  const m = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      guardianName: true,
      guardianPhone: true,
      address: true,
      sportPreference: true,
      dni: true,
      birthDate: true,
      status: true,
      registrationExtra: true,
    },
  })
  if (!m) return null
  const extra =
    m.registrationExtra && typeof m.registrationExtra === 'object' && !Array.isArray(m.registrationExtra)
      ? Object.fromEntries(
          Object.entries(m.registrationExtra as Record<string, unknown>).filter(
            ([, v]) => typeof v === 'string' && v.trim(),
          ),
        )
      : null
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    guardianName: m.guardianName,
    guardianPhone: m.guardianPhone,
    address: m.address,
    sportPreference: m.sportPreference,
    dni: m.dni,
    birthDate: m.birthDate,
    status: m.status,
    registrationExtra: extra && Object.keys(extra).length ? (extra as Record<string, string>) : null,
  }
}

function leadAsMember(lead: {
  id: string
  name: string
  email: string | null
  phone: string | null
  sportPreference: string | null
}): WorkflowMemberPayload {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    guardianName: null,
    guardianPhone: lead.phone,
    address: null,
    sportPreference: lead.sportPreference,
    dni: null,
    birthDate: null,
    status: 'LEAD',
    registrationExtra: null,
  }
}

async function runWorkflowsForTrigger(
  triggerType: WorkflowTriggerType,
  member: WorkflowMemberPayload,
  context: Record<string, unknown> = {},
) {
  const workflows = (await prisma.workflow.findMany({
    where: { isActive: true },
    include: { steps: true },
  })).filter((w) => workflowMatchesTrigger(w, triggerType))

  for (const wf of workflows) {
    await runWorkflowStepsForMember(wf.steps, member, triggerType, context)
  }
}

export async function runBillingCycleWorkflows() {
  // Solo cuotas ACTIVAS, a propósito: una cuota pendiente de pago ya tiene emitida
  // su factura de alta y no debe generar la del periodo hasta que se cobre.
  const subs = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', nextInvoiceDate: { lte: new Date() } },
    include: { member: true, plan: true },
  })
  for (const sub of subs) {
    const member = await loadMemberPayload(sub.memberId)
    if (!member) continue
    try {
      const invoice = await createInvoiceForSubscription(sub.id)
      await runWorkflowsForMemberByTrigger(member.id, 'BILLING_CYCLE_DUE', {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount,
          paidAmount: invoice.paidAmount,
          currency: invoice.currency,
          status: invoice.status,
          dueDate: invoice.dueDate,
        },
      })
    } catch (e) {
      console.warn('[billing-cycle]', sub.id, e)
    }
  }
}

export async function runDocumentExpiringWorkflows() {
  const now = new Date()
  const windows = [30, 15, 5]
  for (const days of windows) {
    const target = new Date(now)
    target.setDate(target.getDate() + days)
    const start = new Date(target)
    start.setHours(0, 0, 0, 0)
    const end = new Date(target)
    end.setHours(23, 59, 59, 999)

    const docs = await prisma.memberDocument.findMany({
      where: { expiresAt: { gte: start, lte: end } },
    })
    for (const doc of docs) {
      const member = await loadMemberPayload(doc.memberId)
      if (!member) continue
      await runWorkflowsForMemberByTrigger(member.id, 'DOCUMENT_EXPIRING', {
        documentType: doc.type,
        documentExpiryDate: doc.expiresAt?.toISOString().slice(0, 10) || '',
      })
    }
  }
}

export async function runCoachAssignedWorkflows(groupId: string, coachMemberId: string) {
  const member = await loadMemberPayload(coachMemberId)
  if (!member) return
  await runWorkflowsForMemberByTrigger(member.id, 'COACH_ASSIGNED', { rosterTeamId: groupId })
}

export async function runTeamChangeApprovedWorkflows(requestId: string) {
  const req = await prisma.groupChangeRequest.findUnique({ where: { id: requestId } })
  if (!req || req.status !== 'APPROVED') return
  const member = await loadMemberPayload(req.memberId)
  if (!member) return
  await runWorkflowsForMemberByTrigger(member.id, 'TEAM_CHANGE_APPROVED', {
    rosterTeamId: req.toGroupId,
    fromGroupId: req.fromGroupId,
    toGroupId: req.toGroupId,
  })
}

export async function runConvocationPublishedWorkflows(eventId: string, audience: 'INVITED' | 'NOT_CALLED') {
  const convocations = await prisma.eventConvocation.findMany({
    where: {
      eventId,
      status: audience === 'NOT_CALLED' ? 'NOT_CALLED' : { in: ['INVITED', 'CONFIRMED', 'DECLINED'] },
    },
  })
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, groupId: true, date: true, location: true },
  })
  if (!event) return

  for (const c of convocations) {
    const member = await loadMemberPayload(c.memberId)
    if (!member) continue
    await runWorkflowsForTrigger('CONVOCATION_PUBLISHED', member, {
      event: {
        id: event.id,
        title: event.title,
        groupId: event.groupId,
        date: event.date,
      },
      eventLocation: event.location || '',
    })
  }
}

// Guarda de re-entrada POR CONTEXTO: un workflow WAITLIST_SLOT_AVAILABLE puede tener
// un paso TRIGGER_WAITLIST_NOTIFY que vuelve a llamar aquí → recursión infinita. Se
// usa AsyncLocalStorage (no un flag global de proceso) para cortar SOLO la re-entrada
// dentro de la MISMA cadena de ejecución, sin bloquear invocaciones legítimamente
// concurrentes de otros tenants/requests.
const waitlistDepth = new AsyncLocalStorage<boolean>()

export async function runWaitlistSlotWorkflows() {
  if (waitlistDepth.getStore()) return // re-entrada en la misma cadena: no recursar
  return waitlistDepth.run(true, async () => {
    const lead = await prisma.lead.findFirst({
      where: { status: 'NEW' },
      orderBy: { createdAt: 'asc' },
    })
    if (!lead) return
    await runWorkflowsForTrigger('WAITLIST_SLOT_AVAILABLE', leadAsMember(lead))
  })
}

export async function runBulkMessageWorkflows(groupId: string, message: string) {
  // Socios EFECTIVOS del grupo (directos + los de sus subgrupos, por contención).
  const memberIds = await effectiveGroupMemberIds(groupId)
  for (const memberId of memberIds) {
    const m = await loadMemberPayload(memberId)
    if (!m) continue
    await runWorkflowsForTrigger('BULK_MESSAGE_REQUESTED', m, {
      bulkMessage: message,
      rosterTeamId: groupId,
    })
  }
}


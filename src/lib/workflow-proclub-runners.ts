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
  /**
   * Para qué mitad de la convocatoria es esta ejecución.
   *
   * El aviso «estás convocado» y el «no estás convocado» escuchan el MISMO
   * disparador y solo se distinguen por este campo de su configuración. Al no
   * filtrarlo aquí, cada socio recibía los dos: al tutor de un chaval convocado
   * le llegaba también el mensaje de que no lo estaba.
   */
  audiencia?: 'INVITED' | 'NOT_CALLED',
) {
  const workflows = (await prisma.workflow.findMany({
    where: { isActive: true },
    include: { steps: true },
  })).filter((w) => workflowMatchesTrigger(w, triggerType))

  for (const wf of workflows) {
    if (audiencia) {
      const cfg = (wf.triggerConfig ?? {}) as { audience?: unknown }
      // Sin audiencia declarada se entiende «a los convocados», que es lo que
      // hace el flujo de convocatoria de toda la vida.
      const suya = String(cfg.audience || 'INVITED').toUpperCase()
      if (suya !== audiencia) continue
    }
    await runWorkflowStepsForMember(wf.steps, member, triggerType, context)
  }
}

/**
 * Dispara el flujo BILLING_CYCLE_DUE de las cuotas que TOCAN este periodo.
 *
 * Antes emitía las facturas él mismo, con la misma consulta y la misma llamada
 * que `generateDueInvoices`. Con los dos crons desplegados eso era una carrera:
 * si coincidían, los dos leían la misma `nextInvoiceDate` y el socio recibía DOS
 * facturas del mismo mes (y si tenía pago automático, pagaba las dos); y si no
 * coincidían, el que llegaba primero emitía y este no encontraba nada, así que
 * el disparador BILLING_CYCLE_DUE no se ejecutaba nunca y los flujos que el club
 * había montado sobre él no salían jamás.
 *
 * Ahora solo NOTIFICA: recorre las facturas de cuota emitidas hoy y dispara el
 * flujo sobre ellas. Emitir es cosa de `generateDueInvoices`, y de nadie más.
 */
export async function runBillingCycleWorkflows() {
  const desdeHoy = new Date()
  desdeHoy.setHours(0, 0, 0, 0)
  const facturas = await prisma.invoice.findMany({
    where: {
      createdAt: { gte: desdeHoy },
      subscriptionId: { not: null },
      status: { not: 'VOID' },
    },
    select: {
      id: true,
      memberId: true,
      invoiceNumber: true,
      totalAmount: true,
      paidAmount: true,
      currency: true,
      status: true,
      dueDate: true,
    },
  })
  for (const invoice of facturas) {
    const member = await loadMemberPayload(invoice.memberId)
    if (!member) continue
    try {
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
      console.warn('[billing-cycle]', invoice.id, e)
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
    }, audience)
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


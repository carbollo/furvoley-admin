import { prisma } from '@/lib/prisma'
import { workflowTriggerLabel } from '@/lib/crm-workflow-triggers'
import { memberStatusChangeMatches } from '@/lib/workflow-trigger-config'
import {
  loadMemberPayload,
  runWorkflowStepsForMember,
  type WorkflowMemberPayload,
  type WorkflowStepRunReport,
  type WorkflowTriggerContext,
  type WorkflowTriggerType,
} from '@/lib/workflow-engine'

export type WorkflowTestResult = {
  ok: boolean
  workflowId: string
  workflowName: string
  triggerType: string
  triggerLabel: string
  subjectId: string
  subjectName: string
  subjectKind: 'member' | 'lead'
  stepsRun: number
  reports: WorkflowStepRunReport[]
  warnings: string[]
  error?: string
}

const LEAD_TRIGGERS = new Set(['LEAD_CREATED', 'LEAD_UPDATED', 'LEAD_COLD_FOLLOWUP'])

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
    guardianPhone: lead.phone,
    address: null,
    sportPreference: lead.sportPreference,
    dni: null,
    birthDate: null,
    status: 'LEAD',
  }
}

async function firstPlayerTeamId(memberId: string): Promise<string | null> {
  const tm = await prisma.teamMember.findFirst({
    where: { memberId, role: 'PLAYER' },
    select: { teamId: true },
    orderBy: { createdAt: 'desc' },
  })
  return tm?.teamId ?? null
}

/** Contexto simulado según el tipo de disparador (datos reales del club cuando existen). */
async function buildSyntheticTriggerContext(
  triggerType: WorkflowTriggerType,
  member: WorkflowMemberPayload,
): Promise<WorkflowTriggerContext> {
  const teamId = await firstPlayerTeamId(member.id)
  const ctx: WorkflowTriggerContext = {}

  if (triggerType === 'MEMBER_STATUS_CHANGED') {
    ctx.previousStatus = 'INACTIVE'
    ctx.currentStatus = member.status
  }

  if (triggerType === 'TEAM_ROSTER_CONFIRMED' || triggerType === 'TEAM_CHANGE_APPROVED') {
    if (teamId) {
      ctx.rosterTeamId = teamId
      ctx.toTeamId = teamId
    }
  }

  if (triggerType === 'TEAM_SCHEDULE_CHANGED' && teamId) {
    ctx.scheduleTeamId = teamId
  }

  if (
    triggerType === 'PAYMENT_CREATED' ||
    triggerType === 'PAYMENT_PAID' ||
    triggerType === 'PAYMENT_FAILED'
  ) {
    const payment = await prisma.payment.findFirst({
      where: { memberId: member.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        month: true,
        year: true,
        status: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    if (payment) {
      ctx.payment = payment
    }
  }

  if (
    triggerType === 'INVOICE_CREATED' ||
    triggerType === 'INVOICE_PAID' ||
    triggerType === 'INVOICE_OVERDUE' ||
    triggerType === 'INVOICE_OVERDUE_ESCALATED'
  ) {
    const invoice = await prisma.invoice.findFirst({
      where: { memberId: member.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        paidAmount: true,
        currency: true,
        status: true,
        dueDate: true,
        stripeCheckoutUrl: true,
      },
    })
    if (invoice) ctx.invoice = invoice
  }

  if (
    triggerType === 'EVENT_CANCELLED' ||
    triggerType === 'EVENT_RESCHEDULED' ||
    triggerType === 'EVENT_STARTING_SOON' ||
    triggerType === 'EVENT_COMPLETED' ||
    triggerType === 'CONVOCATION_PUBLISHED'
  ) {
    const event = await prisma.event.findFirst({
      where: teamId ? { teamId } : undefined,
      orderBy: { date: 'asc' },
      select: { id: true, title: true, teamId: true, date: true, location: true },
    })
    if (event) {
      ctx.event = {
        id: event.id,
        title: event.title,
        teamId: event.teamId,
        date: event.date,
      }
      ctx.eventLocation = event.location ?? ''
    }
  }

  if (triggerType === 'DOCUMENT_EXPIRING') {
    const doc = await prisma.memberDocument.findFirst({
      where: { memberId: member.id },
      orderBy: { expiresAt: 'asc' },
      select: { type: true, expiresAt: true },
    })
    if (doc) {
      ctx.documentType = doc.type
      ctx.documentExpiryDate = doc.expiresAt?.toISOString().slice(0, 10) ?? ''
    }
  }

  if (triggerType === 'COACH_ASSIGNED' || triggerType === 'COACH_SUBSTITUTION_ASSIGNED') {
    if (teamId) ctx.rosterTeamId = teamId
  }

  return ctx
}

async function resolveTestSubject(
  triggerType: WorkflowTriggerType,
  memberId?: string,
  leadId?: string,
): Promise<
  | { ok: true; member: WorkflowMemberPayload; kind: 'member' | 'lead'; warnings: string[] }
  | { ok: false; error: string }
> {
  const warnings: string[] = []

  if (memberId) {
    const member = await loadMemberPayload(memberId)
    if (!member) return { ok: false, error: 'Socio no encontrado.' }
    return { ok: true, member, kind: 'member', warnings }
  }

  if (leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        sportPreference: true,
        memberId: true,
      },
    })
    if (!lead) return { ok: false, error: 'Lead no encontrado.' }
    if (lead.memberId) {
      const member = await loadMemberPayload(lead.memberId)
      if (member) {
        warnings.push('El lead ya está vinculado a un socio; se usa la ficha del socio.')
        return { ok: true, member, kind: 'member', warnings }
      }
    }
    return { ok: true, member: leadAsMember(lead), kind: 'lead', warnings }
  }

  if (LEAD_TRIGGERS.has(triggerType)) {
    const lead = await prisma.lead.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        sportPreference: true,
        memberId: true,
      },
    })
    if (lead) {
      if (lead.memberId) {
        const member = await loadMemberPayload(lead.memberId)
        if (member) {
          warnings.push(`Prueba con socio del lead «${lead.name}».`)
          return { ok: true, member, kind: 'member', warnings }
        }
      }
      warnings.push(`Prueba con lead «${lead.name}» (sin socio vinculado).`)
      return { ok: true, member: leadAsMember(lead), kind: 'lead', warnings }
    }
    warnings.push('No hay leads; se usa un socio de prueba con datos ficticios de lead.')
    const anyMember = await prisma.member.findFirst({ orderBy: { createdAt: 'desc' } })
    if (!anyMember) {
      return { ok: false, error: 'No hay socios ni leads para simular la prueba.' }
    }
    return {
      ok: true,
      member: {
        id: anyMember.id,
        name: anyMember.name,
        email: anyMember.email,
        phone: anyMember.phone,
        guardianPhone: anyMember.guardianPhone ?? anyMember.phone,
        address: anyMember.address,
        sportPreference: anyMember.sportPreference,
        dni: anyMember.dni,
        birthDate: anyMember.birthDate,
        status: 'LEAD',
      },
      kind: 'lead',
      warnings,
    }
  }

  const memberRow = await prisma.member.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: { id: true },
  })
  const pickId =
    memberRow?.id ??
    (
      await prisma.member.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
    )?.id

  if (!pickId) {
    return { ok: false, error: 'No hay socios en el club. Crea al menos uno para probar el flujo.' }
  }

  const member = await loadMemberPayload(pickId)
  if (!member) return { ok: false, error: 'No se pudo cargar el socio de prueba.' }

  warnings.push(`Prueba con socio «${member.name}» (primer activo o el más reciente).`)
  return { ok: true, member, kind: 'member', warnings }
}

/** Ejecuta un flujo concreto simulando su disparador (ignora si está pausado). */
export async function runWorkflowTest(
  workflowId: string,
  options: { memberId?: string; leadId?: string } = {},
): Promise<WorkflowTestResult> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: { steps: true },
  })

  if (!workflow) {
    return {
      ok: false,
      workflowId,
      workflowName: '',
      triggerType: '',
      triggerLabel: '',
      subjectId: '',
      subjectName: '',
      subjectKind: 'member',
      stepsRun: 0,
      reports: [],
      warnings: [],
      error: 'Flujo no encontrado.',
    }
  }

  if (!workflow.steps.length) {
    return {
      ok: false,
      workflowId,
      workflowName: workflow.name,
      triggerType: workflow.triggerType,
      triggerLabel: workflowTriggerLabel(workflow.triggerType),
      subjectId: '',
      subjectName: '',
      subjectKind: 'member',
      stepsRun: 0,
      reports: [],
      warnings: [],
      error: 'El flujo no tiene pasos. Añade al menos uno antes de probar.',
    }
  }

  const triggerType = workflow.triggerType as WorkflowTriggerType
  const subject = await resolveTestSubject(triggerType, options.memberId, options.leadId)
  if (!subject.ok) {
    return {
      ok: false,
      workflowId,
      workflowName: workflow.name,
      triggerType: workflow.triggerType,
      triggerLabel: workflowTriggerLabel(workflow.triggerType),
      subjectId: '',
      subjectName: '',
      subjectKind: 'member',
      stepsRun: 0,
      reports: [],
      warnings: [],
      error: subject.error,
    }
  }

  const warnings = [...subject.warnings]
  if (!workflow.isActive) {
    warnings.push('El flujo está pausado; la prueba se ejecuta igual que en producción.')
  }
  warnings.push(
    'La prueba ejecuta acciones reales (WhatsApp, asignaciones, cobros, etc.) sobre el sujeto elegido.',
  )

  const triggerContext = await buildSyntheticTriggerContext(triggerType, subject.member)

  if (
    triggerType === 'MEMBER_STATUS_CHANGED' &&
    !memberStatusChangeMatches(workflow.triggerConfig, triggerContext, subject.member.status)
  ) {
    const cfg =
      workflow.triggerConfig && typeof workflow.triggerConfig === 'object'
        ? (workflow.triggerConfig as { onlyWhenCurrentStatus?: string; onlyWhenPreviousStatus?: string })
        : {}
    return {
      ok: false,
      workflowId,
      workflowName: workflow.name,
      triggerType: workflow.triggerType,
      triggerLabel: workflowTriggerLabel(workflow.triggerType),
      subjectId: subject.member.id,
      subjectName: subject.member.name,
      subjectKind: subject.kind,
      stepsRun: 0,
      reports: [],
      warnings: subject.warnings,
      error: `El socio de prueba no cumple el filtro de estado (nuevo: ${cfg.onlyWhenCurrentStatus || 'cualquiera'}, anterior: ${cfg.onlyWhenPreviousStatus || 'cualquiera'}). Elige otro socio o ajusta el disparador.`,
    }
  }
  const reports: WorkflowStepRunReport[] = []

  try {
    await runWorkflowStepsForMember(
      workflow.steps,
      subject.member,
      triggerType,
      triggerContext,
      {
        onStepComplete: (r) => reports.push(r),
      },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al ejecutar el flujo'
    return {
      ok: false,
      workflowId,
      workflowName: workflow.name,
      triggerType: workflow.triggerType,
      triggerLabel: workflowTriggerLabel(workflow.triggerType),
      subjectId: subject.member.id,
      subjectName: subject.member.name,
      subjectKind: subject.kind,
      stepsRun: reports.length,
      reports,
      warnings,
      error: msg,
    }
  }

  const failed = reports.filter((r) => r.error || (!r.applied && r.actionType !== 'BRANCH_IF'))
  if (failed.length > 0) {
    warnings.push(`${failed.length} paso(s) con error o sin aplicar. Revisa el detalle.`)
  }

  return {
    ok: failed.length === 0,
    workflowId,
    workflowName: workflow.name,
    triggerType: workflow.triggerType,
    triggerLabel: workflowTriggerLabel(workflow.triggerType),
    subjectId: subject.member.id,
    subjectName: subject.member.name,
    subjectKind: subject.kind,
    stepsRun: reports.length,
    reports,
    warnings,
  }
}

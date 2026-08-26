import { prisma } from '@/lib/prisma'
import { sendApiWassText } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'
import { buildInvoiceVariables, runExtendedWorkflowAction } from '@/lib/workflow-engine-more'
import { populateTeamRosterVariables } from '@/lib/workflow-team-context'
import { memberStatusChangeMatches } from '@/lib/workflow-trigger-config'
import { buildMemberExtraVariables } from '@/lib/registration-fields'

export type WorkflowMemberPayload = {
  id: string
  name: string
  email: string | null
  phone: string | null
  guardianName: string | null
  guardianPhone: string | null
  address: string | null
  sportPreference: string | null
  dni: string | null
  birthDate: Date | null
  status: string
  registrationExtra: Record<string, string> | null
}

function parseRegistrationExtra(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim()
  }
  return Object.keys(out).length ? out : null
}

function memberRowToPayload(row: {
  id: string
  name: string
  email: string | null
  phone: string | null
  guardianName?: string | null
  guardianPhone: string | null
  address: string | null
  sportPreference: string | null
  dni: string | null
  birthDate: Date | null
  status: string
  registrationExtra?: unknown
}): WorkflowMemberPayload {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    guardianName: row.guardianName ?? null,
    guardianPhone: row.guardianPhone,
    address: row.address,
    sportPreference: row.sportPreference,
    dni: row.dni,
    birthDate: row.birthDate,
    status: row.status,
    registrationExtra: parseRegistrationExtra(row.registrationExtra),
  }
}

function formatBirthDateIso(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

type WorkflowRunContext = {
  variables: Record<string, string>
  teamNameCache: Map<string, string>
}

export type WorkflowTriggerType =
  | 'MEMBER_CREATED'
  | 'TEAM_ROSTER_CONFIRMED'
  | 'TEAM_SCHEDULE_CHANGED'
  | 'MEMBER_UPDATED'
  | 'MEMBER_STATUS_CHANGED'
  | 'PAYMENT_CREATED'
  | 'PAYMENT_PAID'
  | 'INVOICE_CREATED'
  | 'ENROLLMENT_PAYMENT_DUE'
  | 'INVOICE_PAID'
  | 'INVOICE_OVERDUE'
  | 'SUBSCRIPTION_CREATED'
  | 'LEAD_CREATED'
  | 'LEAD_UPDATED'
  | 'EVENT_CANCELLED'
  | 'EVENT_RESCHEDULED'
  | 'EVENT_STARTING_SOON'
  | 'EVENT_COMPLETED'
  | 'ATTENDANCE_ABSENT_UNEXCUSED'
  | 'DOCUMENT_EXPIRING'
  | 'BILLING_CYCLE_DUE'
  | 'CONVOCATION_PUBLISHED'
  | 'COACH_ASSIGNED'
  | 'COACH_SUBSTITUTION_ASSIGNED'
  | 'TEAM_CHANGE_APPROVED'
  | 'EVALUATION_PUBLISHED'
  | 'BULK_MESSAGE_REQUESTED'
  | 'INCIDENT_RESOLVED'
  | 'CONSENT_PENDING'
  | 'WAITLIST_SLOT_AVAILABLE'
  | 'LEAD_COLD_FOLLOWUP'
  | 'TRIAL_REMINDER_DUE'
  | 'EXTRA_CHARGE_CREATED'
  | 'PAYMENT_FAILED'
  | 'INVOICE_OVERDUE_ESCALATED'
  | 'OVERDUE_REPORT_DUE'
  | 'PAYMENT_METHOD_EXPIRING'
  | 'SUBSCRIPTION_PAUSED'
  | 'MEMBER_CREDIT_APPLIED'
  | 'SEASON_RENEWAL_DUE'
  | 'ACCOUNTING_EXPORT_DUE'
  | 'MEMBER_LEAVE_REQUESTED'
  | 'MEMBER_RETURN_CAMPAIGN'

export type WorkflowTriggerContext = {
  previousStatus?: string | null
  currentStatus?: string | null
  payment?: {
    id: string
    amount: number
    month: number
    year: number
    status: string
    paidAt: Date | null
    createdAt: Date
    updatedAt: Date
  } | null
  invoice?: {
    id: string
    invoiceNumber: string
    totalAmount: number
    paidAmount: number
    currency: string
    status: string
    dueDate: Date
    /** Enlace de cobro de la pasarela del club. */
    whopCheckoutUrl?: string | null
  } | null
  event?: {
    id: string
    title: string
    groupId: string | null
    date: Date
  } | null
  /** Equipo destino al confirmar plantilla (cambio de grupo). */
  rosterTeamId?: string | null
  /** Equipo cuyos horarios fijos cambiaron (WD-2). */
  scheduleTeamId?: string | null
  fromGroupId?: string | null
  toGroupId?: string | null
  documentType?: string | null
  documentExpiryDate?: string | null
  bulkMessage?: string | null
  eventLocation?: string | null
}

function tokenSafePart(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[^\w]/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function snapshotNodeScopedVariables(runContext: WorkflowRunContext, stepKey: string) {
  const safeStepKey = tokenSafePart(stepKey || 'step')
  if (!safeStepKey) return
  const entries = Object.entries(runContext.variables).filter(([k]) => !k.startsWith('node_'))
  for (const [key, value] of entries) {
    runContext.variables[`node_${safeStepKey}_${key}`] = value
  }
}

function defaultWorkflowVariables() {
  return {
    triggerType: '',
    triggerEventAt: '',
    triggerMemberId: '',
    triggerMemberName: '',
    triggerMemberEmail: '',
    triggerMemberPhone: '',
    triggerMemberStatus: '',
    triggerPreviousStatus: '',
    triggerCurrentStatus: '',
    triggerPaymentId: '',
    triggerPaymentAmount: '',
    triggerPaymentMonth: '',
    triggerPaymentYear: '',
    triggerPaymentStatus: '',
    triggerPaymentPaidAt: '',
    triggerPaymentCreatedAt: '',
    triggerPaymentUpdatedAt: '',
    stepActionType: '',
    stepPosition: '',
    stepLabel: '',
    stepApplied: 'false',
    stepError: '',
    stepTargetTeamId: '',
    stepTargetTeamName: '',
    stepTargetStatus: '',
    stepTargetSportPreference: '',
    stepTargetEmail: '',
    stepTargetPhone: '',
    stepTargetAddress: '',
    stepTargetDni: '',
    stepTargetBirthDate: '',
    stepCreatedPaymentId: '',
    stepCreatedPaymentAmount: '',
    stepCreatedPaymentMonth: '',
    stepCreatedPaymentYear: '',
    stepCreatedPaymentStatus: '',
    stepCreatedSignupLinkId: '',
    stepCreatedSignupLinkToken: '',
    stepCreatedSignupLinkExpiresAt: '',
    stepCreatedTransactionId: '',
    stepCreatedTransactionType: '',
    stepCreatedTransactionAmount: '',
    stepCreatedTransactionDescription: '',
    stepHttpStatus: '',
    stepHttpOk: '',
    stepHttpResponse: '',
    stepSentWhatsAppPhone: '',
    stepSentWhatsAppMessage: '',
    stepSentWhatsAppSessionId: '',
    stepWhatsAppSent: '',
    stepWhatsAppError: '',
    stepBranchResult: '',
    assignedTeamId: '',
    assignedTeamName: '',
    teamAssignedId: '',
    teamAssignedName: '',
    assignmentApplied: 'false',
    invoiceId: '',
    invoiceNumber: '',
    invoiceTotal: '',
    invoiceCurrency: '',
    pendingAmount: '',
    invoiceStatus: '',
    invoiceDueDate: '',
    paymentUrl: '',
    // Alias en español (los que ofrece el editor de flujos): deben existir aunque
    // no haya factura en contexto, o el token se enviaría tal cual al socio.
    enlace_cobro: '',
    importe_pendiente: '',
    invoicePdfUrl: '',
    subscriptionId: '',
    signupLinkUrl: '',
    teamScheduleSummary: '',
    teamTrainingLocation: '',
    coachName: '',
    coachPhone: '',
    coachEmail: '',
    guardianPhone: '',
    eventId: '',
    eventTitle: '',
    groupId: '',
    rosterTeamId: '',
  } satisfies Record<string, string>
}

function buildTriggerVariables(
  triggerType: WorkflowTriggerType,
  member: WorkflowMemberPayload,
  context: WorkflowTriggerContext,
) {
  const payment = context.payment
  const memberAge = member.birthDate ? String(calculateAge(member.birthDate)) : ''
  return {
    triggerType,
    triggerEventAt: new Date().toISOString(),
    triggerMemberId: member.id,
    triggerMemberName: member.name ?? '',
    triggerMemberEmail: member.email ?? '',
    triggerMemberPhone: member.phone ?? '',
    guardianPhone: member.guardianPhone ?? member.phone ?? '',
    triggerMemberStatus: member.status ?? '',
    triggerMemberDni: member.dni ?? '',
    triggerMemberAddress: member.address ?? '',
    triggerMemberBirthDate: formatBirthDateIso(member.birthDate),
    triggerMemberSportPreference: member.sportPreference ?? '',
    triggerMemberGuardianName: member.guardianName ?? '',
    triggerMemberGuardianPhone: member.guardianPhone ?? '',
    triggerMemberAge: memberAge,
    triggerPreviousStatus: String(context.previousStatus || ''),
    triggerCurrentStatus: String(context.currentStatus || member.status || ''),
    triggerPaymentId: String(payment?.id || ''),
    triggerPaymentAmount: payment ? String(payment.amount) : '',
    triggerPaymentMonth: payment ? String(payment.month) : '',
    triggerPaymentYear: payment ? String(payment.year) : '',
    triggerPaymentStatus: String(payment?.status || ''),
    triggerPaymentPaidAt: payment?.paidAt ? payment.paidAt.toISOString() : '',
    triggerPaymentCreatedAt: payment?.createdAt ? payment.createdAt.toISOString() : '',
    triggerPaymentUpdatedAt: payment?.updatedAt ? payment.updatedAt.toISOString() : '',
    ...(context.invoice ? buildInvoiceVariables(context.invoice) : {}),
    ...buildMemberExtraVariables(member.registrationExtra),
    eventId: String(context.event?.id || ''),
    eventTitle: String(context.event?.title || ''),
    eventDate: context.event?.date
      ? new Date(context.event.date).toLocaleString('es-ES', {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : '',
    eventLocation: String(context.eventLocation || ''),
    groupId: String(
      context.event?.groupId || context.scheduleTeamId || context.rosterTeamId || '',
    ),
    fromGroupId: String(context.fromGroupId || ''),
    toGroupId: String(context.toGroupId || ''),
    documentType: String(context.documentType || ''),
    documentExpiryDate: String(context.documentExpiryDate || ''),
    bulkMessage: String(context.bulkMessage || ''),
    rosterTeamId: String(context.rosterTeamId || ''),
    scheduleTeamId: String(context.scheduleTeamId || ''),
    ...(context.rosterTeamId
      ? {
          assignedTeamId: String(context.rosterTeamId),
          teamAssignedId: String(context.rosterTeamId),
        }
      : {}),
  } satisfies Record<string, string>
}

function setStepActionBase(runContext: WorkflowRunContext, actionType: string) {
  runContext.variables.stepActionType = actionType
  runContext.variables.stepApplied = 'false'
  runContext.variables.stepError = ''
}

function calculateAge(birthDate: Date, now = new Date()) {
  let age = now.getFullYear() - birthDate.getFullYear()
  const monthDiff = now.getMonth() - birthDate.getMonth()
  const beforeBirthday = monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())
  if (beforeBirthday) age--
  return age
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

function toPeriodWithOffset(date: Date, monthOffset: number) {
  const shifted = new Date(date.getFullYear(), date.getMonth() + monthOffset, 1)
  return {
    month: shifted.getMonth() + 1,
    year: shifted.getFullYear(),
  }
}

/** Resuelve índice del paso por stepKey o, si no existe, por label (workflows antiguos). */
function resolveStepIndex(
  steps: { config: unknown; position: number }[],
  targetRef: string | null,
): number {
  if (!targetRef) return -1
  const sorted = [...steps].sort((a, b) => a.position - b.position)
  const byKey = sorted.findIndex((s) => readString(s.config, 'stepKey') === targetRef)
  if (byKey >= 0) return byKey
  const byLabel = sorted.findIndex((s) => readString(s.config, 'label') === targetRef)
  return byLabel
}

function interpolateHttpTemplate(
  template: string,
  member: WorkflowMemberPayload,
  runContext?: WorkflowRunContext,
): string {
  const memberAge = member.birthDate ? String(calculateAge(member.birthDate)) : ''
  const map: Record<string, string> = {
    memberId: member.id,
    memberName: member.name ?? '',
    memberEmail: member.email ?? '',
    memberPhone: member.phone ?? '',
    guardianPhone: member.guardianPhone ?? member.phone ?? '',
    memberAddress: member.address ?? '',
    memberDni: member.dni ?? '',
    memberStatus: member.status ?? '',
    memberSportPreference: member.sportPreference ?? '',
    memberAge,
    memberBirthDate: formatBirthDateIso(member.birthDate),
    memberGuardianName: member.guardianName ?? '',
    memberGuardianPhone: member.guardianPhone ?? '',
    ...buildMemberExtraVariables(member.registrationExtra),
  }
  if (runContext) Object.assign(map, runContext.variables)
  // Accept multiple token styles so workflow configs are resilient:
  // - {memberName}
  // - (memberName)
  // - {{memberName}}
  return template.replace(/\{\{(\w+)\}\}|\{(\w+)\}|\((\w+)\)/g, (match, k1, k2, k3) => {
    const key = String(k1 || k2 || k3 || '')
    if (!key) return match
    return map[key] ?? match
  })
}

function isAllowedHttpUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    if (u.protocol === 'https:') return true
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
      return true
    }
    return false
  } catch {
    return false
  }
}

function normalizeText(v: string | null): string {
  return (v || '').trim().toLowerCase()
}

function parsePreferenceMap(config: unknown): Record<string, string> {
  const raw =
    config && typeof config === 'object'
      ? (config as Record<string, unknown>).teamByPreference
      : undefined
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object') return {}
      return Object.fromEntries(
        Object.entries(parsed)
          .map(([k, v]) => [normalizeText(k), String(v || '').trim()])
          .filter(([k, v]) => !!k && !!v),
      )
    } catch {
      return {}
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>)
        .map(([k, v]) => [normalizeText(k), String(v || '').trim()])
        .filter(([k, v]) => !!k && !!v),
    )
  }
  return {}
}

function parseIsoDate(config: unknown, key: string): Date | null {
  const raw = readString(config, key)
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function evalBranchCondition(
  config: unknown,
  member: WorkflowMemberPayload,
  runContext?: WorkflowRunContext,
): boolean {
  const field = readString(config, 'ifField')
  const op = readString(config, 'ifOperator') || 'eq'
  const compareRawBase = readString(config, 'ifValue')
  const compareRaw = compareRawBase
    ? interpolateHttpTemplate(compareRawBase, member, runContext)
    : compareRawBase
  if (!field) return false

  let left: string | number | boolean | null = null

  if (field === 'member.age') {
    if (!member.birthDate) left = null
    else left = calculateAge(member.birthDate)
  } else if (field === 'member.status') {
    left = member.status
  } else if (field === 'member.hasBirthDate') {
    left = !!member.birthDate
  } else if (field === 'member.name') {
    left = member.name
  } else if (field === 'member.email') {
    left = member.email ?? ''
  } else if (field === 'member.phone') {
    left = member.phone ?? ''
  } else if (field === 'member.dni') {
    left = member.dni ?? ''
  } else if (field === 'member.address') {
    left = member.address ?? ''
  } else if (field === 'member.sportPreference') {
    left = member.sportPreference ?? ''
  } else if (field === 'member.guardianName') {
    left = member.guardianName ?? ''
  } else if (field === 'member.guardianPhone') {
    left = member.guardianPhone ?? ''
  } else if (field.startsWith('member.extra.')) {
    const key = field.slice('member.extra.'.length)
    left = member.registrationExtra?.[key] ?? ''
  } else if (field === 'trigger.currentStatus') {
    left = String(runContext?.variables.triggerCurrentStatus || '')
  } else if (field === 'trigger.previousStatus') {
    left = String(runContext?.variables.triggerPreviousStatus || '')
  }

  if (left === null && field === 'member.age') {
    return op === 'eq' && compareRaw === '' ? false : false
  }

  const compareBool = compareRaw === 'true' || compareRaw === '1'
  const compareNum = compareRaw != null && compareRaw !== '' ? Number(compareRaw) : NaN

  if (typeof left === 'boolean') {
    const right = compareBool
    if (op === 'eq') return left === right
    if (op === 'ne') return left !== right
    return false
  }

  if (typeof left === 'number' && Number.isFinite(compareNum)) {
    if (op === 'eq') return Math.abs(left - compareNum) < 0.001
    if (op === 'ne') return Math.abs(left - compareNum) >= 0.001
    if (op === 'lt') return left < compareNum
    if (op === 'lte') return left <= compareNum
    if (op === 'gt') return left > compareNum
    if (op === 'gte') return left >= compareNum
    return false
  }

  const l = String(left ?? '')
  const r = compareRaw ?? ''
  if (op === 'eq') return l === r
  if (op === 'ne') return l !== r
  if (op === 'contains') return l.toLowerCase().includes(r.toLowerCase())
  return false
}

async function runMemberCreatedStepAction(
  step: {
    actionType: string
    config: unknown
  },
  member: WorkflowMemberPayload,
  runContext: WorkflowRunContext,
  triggerType: WorkflowTriggerType,
): Promise<void> {
  if (
    await runExtendedWorkflowAction(step, member, runContext, (tpl, m, ctx) =>
      interpolateHttpTemplate(tpl, m, ctx),
    )
  ) {
    return
  }

  function setStepError(message: string) {
    runContext.variables.stepError = String(message || '').trim()
    runContext.variables.stepApplied = 'false'
  }

  function setStepApplied() {
    runContext.variables.stepApplied = 'true'
    runContext.variables.stepError = ''
  }

  async function resolveWorkflowWhatsAppSessionId(explicitSessionId?: string) {
    const explicit = String(explicitSessionId || '').trim()
    if (explicit) return explicit
    const cfg = await getWhatsAppConfig()
    const linked = String(cfg.linkedSessionId || '').trim()
    return linked || undefined
  }

  async function resolveTeamName(groupId: string) {
    const cached = runContext.teamNameCache.get(groupId)
    if (cached) return cached
    const team = await prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true },
    })
    const name = String(team?.name || '')
    if (name) runContext.teamNameCache.set(groupId, name)
    return name
  }

  async function setAssignedTeamResult(groupId: string | null, applied: boolean) {
    const cleanId = String(groupId || '').trim()
    const teamName = cleanId ? await resolveTeamName(cleanId) : ''
    const flag = applied ? 'true' : 'false'
    runContext.variables.stepTargetTeamId = cleanId
    runContext.variables.stepTargetTeamName = teamName
    runContext.variables.assignedTeamId = cleanId
    runContext.variables.assignedTeamName = teamName
    runContext.variables.teamAssignedId = cleanId
    runContext.variables.teamAssignedName = teamName
    runContext.variables.assignmentApplied = flag
    runContext.variables.stepApplied = flag
    if (applied) {
      runContext.variables.stepError = ''
      if (cleanId) await populateTeamRosterVariables(cleanId, runContext.variables)
    }
  }

  if (step.actionType === 'ASSIGN_TEAM_BY_AGE') {
    if (runContext.variables.triggerType === 'TEAM_ROSTER_CONFIRMED') {
      const existing = await prisma.groupMembership.findFirst({
        where: { memberId: member.id, role: 'PLAYER' },
        select: { groupId: true },
      })
      if (existing?.groupId) {
        await setAssignedTeamResult(existing.groupId, true)
        return
      }
    }

    if (!member.birthDate) {
      await setAssignedTeamResult(null, false)
      return
    }

    // Si el paso referencia una categoría, su edad min/max y equipo por defecto
    // mandan (se recalculan solos cada temporada). Si no, se usan los valores
    // literales del paso (compatibilidad con flujos antiguos).
    const categoryId = readString(step.config, 'categoryId')
    let category: { minAge: number | null; maxAge: number | null; defaultGroupId: string | null } | null = null
    if (categoryId) {
      category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { minAge: true, maxAge: true, defaultGroupId: true },
      })
    }

    const maxAge = category ? category.maxAge : readNumber(step.config, 'maxAge')
    const minAge = category ? category.minAge : readNumber(step.config, 'minAge')
    const groupId = readString(step.config, 'groupId') || category?.defaultGroupId || ''
    if (!groupId) {
      await setAssignedTeamResult(null, false)
      return
    }

    const age = calculateAge(member.birthDate)
    if (minAge !== null && age < minAge) {
      await setAssignedTeamResult(null, false)
      return
    }
    if (maxAge !== null && age > maxAge) {
      await setAssignedTeamResult(null, false)
      return
    }

    await prisma.groupMembership.upsert({
      where: {
        groupId_memberId: {
          groupId,
          memberId: member.id,
        },
      },
      update: { role: 'PLAYER' },
      create: { groupId, memberId: member.id, role: 'PLAYER' },
    })
    await setAssignedTeamResult(groupId, true)
    return
  }

  if (step.actionType === 'ASSIGN_TEAM') {
    const groupId = readString(step.config, 'groupId')
    if (!groupId) {
      await setAssignedTeamResult(null, false)
      return
    }

    await prisma.groupMembership.upsert({
      where: {
        groupId_memberId: {
          groupId,
          memberId: member.id,
        },
      },
      update: { role: 'PLAYER' },
      create: { groupId, memberId: member.id, role: 'PLAYER' },
    })
    await setAssignedTeamResult(groupId, true)
    return
  }

  if (step.actionType === 'ASSIGN_TEAM_BY_PREFERENCE') {
    const key = normalizeText(member.sportPreference)
    if (!key) {
      await setAssignedTeamResult(null, false)
      return
    }
    const map = parsePreferenceMap(step.config)
    const groupId = map[key]
    if (!groupId) {
      await setAssignedTeamResult(null, false)
      return
    }
    await prisma.groupMembership.upsert({
      where: {
        groupId_memberId: {
          groupId,
          memberId: member.id,
        },
      },
      update: { role: 'PLAYER' },
      create: { groupId, memberId: member.id, role: 'PLAYER' },
    })
    await setAssignedTeamResult(groupId, true)
    return
  }

  if (step.actionType === 'REMOVE_FROM_TEAM') {
    const groupId = readString(step.config, 'groupId')
    if (groupId) {
      await prisma.groupMembership.deleteMany({
        where: {
          memberId: member.id,
          groupId,
        },
      })
    } else {
      await prisma.groupMembership.deleteMany({
        where: { memberId: member.id },
      })
    }
    await setAssignedTeamResult(null, true)
    return
  }

  if (step.actionType === 'SET_MEMBER_STATUS') {
    const targetStatus = readString(step.config, 'targetStatus')
    if (!targetStatus) {
      setStepError('targetStatus vacío')
      return
    }
    runContext.variables.stepTargetStatus = targetStatus

    if (member.status !== targetStatus) {
      await prisma.member.update({
        where: { id: member.id },
        data: { status: targetStatus },
      })
      member.status = targetStatus
    }
    setStepApplied()
    return
  }

  if (step.actionType === 'SET_MEMBER_SPORT_PREFERENCE') {
    const sportPreference = readString(step.config, 'sportPreference')
    if (!sportPreference) {
      setStepError('sportPreference vacío')
      return
    }
    runContext.variables.stepTargetSportPreference = sportPreference
    await prisma.member.update({
      where: { id: member.id },
      data: { sportPreference },
    })
    member.sportPreference = sportPreference
    setStepApplied()
    return
  }

  if (step.actionType === 'SET_MEMBER_CONTACT') {
    const email = readString(step.config, 'email')
    const phone = readString(step.config, 'phone')
    const address = readString(step.config, 'address')
    if (!email && !phone && !address) {
      setStepError('sin datos de contacto')
      return
    }
    runContext.variables.stepTargetEmail = email || ''
    runContext.variables.stepTargetPhone = phone || ''
    runContext.variables.stepTargetAddress = address || ''
    await prisma.member.update({
      where: { id: member.id },
      data: {
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(address ? { address } : {}),
      },
    })
    if (email) member.email = email
    if (phone) member.phone = phone
    if (address) member.address = address
    setStepApplied()
    return
  }

  if (step.actionType === 'SET_MEMBER_DNI') {
    const dni = readString(step.config, 'dni')
    if (!dni) {
      setStepError('dni vacío')
      return
    }
    runContext.variables.stepTargetDni = dni
    await prisma.member.update({
      where: { id: member.id },
      data: { dni },
    })
    member.dni = dni
    setStepApplied()
    return
  }

  if (step.actionType === 'SET_MEMBER_BIRTHDATE') {
    const birthDate = parseIsoDate(step.config, 'birthDate')
    if (!birthDate) {
      setStepError('birthDate inválida')
      return
    }
    runContext.variables.stepTargetBirthDate = birthDate.toISOString()
    await prisma.member.update({
      where: { id: member.id },
      data: { birthDate },
    })
    member.birthDate = birthDate
    setStepApplied()
    return
  }

  if (step.actionType === 'CREATE_PAYMENT') {
    const amount = readNumber(step.config, 'amount')
    if (amount === null || amount <= 0) {
      setStepError('amount inválido')
      return
    }

    const monthOffset = readNumber(step.config, 'monthOffset') ?? 0
    const { month, year } = toPeriodWithOffset(new Date(), Math.trunc(monthOffset))
    const paymentStatus = readString(step.config, 'paymentStatus') || 'PENDING'

    const createdPayment = await prisma.payment.create({
      data: {
        memberId: member.id,
        amount,
        month,
        year,
        status: paymentStatus,
      },
    })
    runContext.variables.stepCreatedPaymentId = createdPayment.id
    runContext.variables.stepCreatedPaymentAmount = String(createdPayment.amount)
    runContext.variables.stepCreatedPaymentMonth = String(createdPayment.month)
    runContext.variables.stepCreatedPaymentYear = String(createdPayment.year)
    runContext.variables.stepCreatedPaymentStatus = createdPayment.status
    setStepApplied()
    return
  }

  if (step.actionType === 'CREATE_SIGNUP_LINK') {
    if (runContext.variables.triggerType === 'MEMBER_CREATED') {
      console.warn(
        '[workflow] CREATE_SIGNUP_LINK en MEMBER_CREATED no tiene sentido: el socio ya está dado de alta. Usa CREATE_INVITE_SIGNUP_LINK con disparador LEAD_CREATED o el botón Invitar del CRM.',
      )
      setStepError('Enlace de inscripción omitido: el socio ya está registrado')
      return
    }
    const maxUses = Math.max(1, Math.trunc(readNumber(step.config, 'maxUses') ?? 1))
    const expiresInDays = Math.max(1, Math.trunc(readNumber(step.config, 'expiresInDays') ?? 30))
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    const link = await prisma.signupLink.create({
      data: {
        token: crypto.randomUUID().replace(/-/g, ''),
        maxUses,
        expiresAt,
        createdMemberId: member.id,
      },
    })
    runContext.variables.stepCreatedSignupLinkId = link.id
    runContext.variables.stepCreatedSignupLinkToken = link.token
    runContext.variables.stepCreatedSignupLinkExpiresAt = link.expiresAt
      ? link.expiresAt.toISOString()
      : ''
    setStepApplied()
    return
  }

  if (step.actionType === 'CREATE_TRANSACTION') {
    const amount = readNumber(step.config, 'amount')
    const description = readString(step.config, 'description')
    const type = (readString(step.config, 'type') || 'INCOME').toUpperCase()
    if (amount === null || amount <= 0 || !description) {
      setStepError('datos de transacción incompletos')
      return
    }
    const tx = await prisma.transaction.create({
      data: {
        type: type === 'EXPENSE' ? 'EXPENSE' : 'INCOME',
        amount,
        description,
        date: new Date(),
        source: 'MANUAL',
      },
    })
    runContext.variables.stepCreatedTransactionId = tx.id
    runContext.variables.stepCreatedTransactionType = tx.type
    runContext.variables.stepCreatedTransactionAmount = String(tx.amount)
    runContext.variables.stepCreatedTransactionDescription = tx.description
    setStepApplied()
    return
  }

  if (step.actionType === 'SEND_WHATSAPP') {
    const sessionId = await resolveWorkflowWhatsAppSessionId(readString(step.config, 'waSessionId') || undefined)
    const phoneTpl = readString(step.config, 'waPhone') || '{memberPhone}'
    const messageTpl = readString(step.config, 'waMessage') || ''
    // ¿La plantilla apunta al SOCIO (o su tutor)? Solo entonces es seguro caer a
    // member.phone. Si apunta a un teléfono NO-socio ({clubAdminPhone}, {coachPhone}…)
    // y resuelve vacío, NO se redirige al socio (evitaría filtrarle un mensaje
    // interno): se deja vacío y el control de abajo marca error y no envía.
    const memberTargeted = /member/i.test(phoneTpl) || /guardian/i.test(phoneTpl)
    let phone = interpolateHttpTemplate(phoneTpl, member, runContext).replace(/[^\d+]/g, '')
    if (!phone && /guardian/i.test(phoneTpl)) {
      phone = String(member.guardianPhone || member.phone || '').replace(/[^\d+]/g, '')
    }
    if (!phone && memberTargeted) {
      phone = String(member.phone || '').replace(/[^\d+]/g, '')
    }
    const message = interpolateHttpTemplate(messageTpl, member, runContext)
    runContext.variables.stepSentWhatsAppPhone = phone
    runContext.variables.stepSentWhatsAppMessage = message
    runContext.variables.stepSentWhatsAppSessionId = String(sessionId || '')
    if (!phone || !message.trim()) {
      runContext.variables.stepWhatsAppSent = 'false'
      runContext.variables.stepWhatsAppError = 'phone/message vacío'
      setStepError('phone/message vacío')
      return
    }
    try {
      await sendApiWassText({ sessionId, phone, message })
      runContext.variables.stepWhatsAppSent = 'true'
      runContext.variables.stepWhatsAppError = ''
      setStepApplied()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error whatsapp'
      runContext.variables.stepWhatsAppSent = 'false'
      runContext.variables.stepWhatsAppError = msg
      setStepError(msg)
      console.warn('[workflow] SEND_WHATSAPP fallo:', e)
    }
    return
  }

  if (step.actionType === 'HTTP_REQUEST') {
    const url = readString(step.config, 'httpUrl')
    const method = (readString(step.config, 'httpMethod') || 'GET').toUpperCase()
    if (!url || !isAllowedHttpUrl(url)) {
      setStepError('url no permitida')
      console.warn('[workflow] HTTP_REQUEST URL no permitida:', url)
      return
    }
    const httpDisabled =
      process.env.WORKFLOW_HTTP_DISABLED === '1' || process.env.WORKFLOW_HTTP_DISABLED === 'true'
    if (httpDisabled) {
      setStepError('http desactivado por env')
      console.warn('[workflow] HTTP desactivado por WORKFLOW_HTTP_DISABLED')
      return
    }

    let headers: Record<string, string> = {}
    const headersRaw = readString(step.config, 'httpHeaders')
    if (headersRaw) {
      try {
        const parsed = JSON.parse(headersRaw) as Record<string, string>
        if (parsed && typeof parsed === 'object') headers = { ...parsed }
      } catch {
        /* ignore */
      }
    }

    let body: string | undefined
    const bodyTpl = readString(step.config, 'httpBody')
    if (bodyTpl && method !== 'GET' && method !== 'HEAD') {
      body = interpolateHttpTemplate(bodyTpl, member, runContext)
      const hasCt = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
      if (!hasCt) headers['Content-Type'] = 'application/json'
    }

    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 15_000)
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ?? undefined,
        signal: ac.signal,
      })
      runContext.variables.stepHttpStatus = String(response.status)
      runContext.variables.stepHttpOk = response.ok ? 'true' : 'false'
      const bodyText = await response.text().catch(() => '')
      runContext.variables.stepHttpResponse = bodyText.slice(0, 500)
      if (!response.ok) {
        setStepError(`http ${response.status}`)
      } else {
        setStepApplied()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'http error'
      setStepError(msg)
      console.warn('[workflow] HTTP_REQUEST fallo:', e)
    } finally {
      clearTimeout(t)
    }
  }
}

export type WorkflowStepRunReport = {
  position: number
  stepKey: string
  actionType: string
  applied: boolean
  branchResult?: string
  error?: string
}

export async function runWorkflowStepsForMember(
  steps: { position: number; stepType: string; actionType: string; config: unknown }[],
  member: WorkflowMemberPayload,
  triggerType: WorkflowTriggerType,
  triggerContext: WorkflowTriggerContext,
  options?: { onStepComplete?: (report: WorkflowStepRunReport) => void },
) {
  const runContext: WorkflowRunContext = {
    variables: {
      ...defaultWorkflowVariables(),
      ...buildTriggerVariables(triggerType, member, triggerContext),
    },
    teamNameCache: new Map<string, string>(),
  }

  try {
    const { getClubIssuer } = await import('@/lib/club-settings')
    const issuer = await getClubIssuer()
    runContext.variables.clubAdminPhone = issuer.contactPhone || ''
    runContext.variables.clubName = issuer.name || ''
  } catch {
    /* optional */
  }

  if (triggerContext.event?.groupId) {
    runContext.variables.groupId = triggerContext.event.groupId
  }

  if (triggerType === 'TEAM_ROSTER_CONFIRMED') {
    const rosterTeamId =
      triggerContext.rosterTeamId?.trim() ||
      (await prisma.groupMembership.findFirst({
        where: { memberId: member.id, role: 'PLAYER' },
        select: { groupId: true },
      }))?.groupId
    if (rosterTeamId) {
      runContext.variables.rosterTeamId = rosterTeamId
      runContext.variables.assignedTeamId = rosterTeamId
      runContext.variables.teamAssignedId = rosterTeamId
      runContext.variables.groupId = rosterTeamId
      await populateTeamRosterVariables(rosterTeamId, runContext.variables)
    }
  }

  if (triggerType === 'TEAM_SCHEDULE_CHANGED') {
    const scheduleTeamId = triggerContext.scheduleTeamId?.trim()
    if (scheduleTeamId) {
      runContext.variables.groupId = scheduleTeamId
      runContext.variables.scheduleTeamId = scheduleTeamId
      await populateTeamRosterVariables(scheduleTeamId, runContext.variables)
    }
  }

  const sorted = [...steps].sort((a, b) => a.position - b.position)
  const maxIter = Math.max(sorted.length * 25, 50)
  let i = 0
  let guard = 0

  // Anti back-edge: un BRANCH_IF puede saltar hacia atrás y volver a entrar en un
  // paso con EFECTOS (enviar WhatsApp, crear cobro, aplicar descuento…). Cada paso
  // con efectos se ejecuta como MUCHO una vez por run; los pasos puros (BRANCH_IF,
  // set de variables) sí pueden re-evaluarse (acotados por maxIter).
  const sideEffectDone = new Set<number>()
  const isSideEffectAction = (t: string) =>
    /^(SEND_|CREATE_|APPLY_|TRIGGER_|ASSIGN_|UPDATE_|DELETE_|ENROLL_|CHARGE_|MARK_|HTTP_|GENERATE_|CANCEL_|RETRY_)/.test(t)

  while (i < sorted.length && guard++ < maxIter) {
    const step = sorted[i]
    const stepKey = readString(step.config, 'stepKey') || `step_${step.position}`
    runContext.variables.stepPosition = String(step.position)
    runContext.variables.stepLabel = readString(step.config, 'label') || stepKey
    setStepActionBase(runContext, step.actionType)

    if (step.actionType === 'BRANCH_IF') {
      const ok = evalBranchCondition(step.config, member, runContext)
      runContext.variables.stepApplied = 'true'
      runContext.variables.stepBranchResult = ok ? 'then' : 'else'
      snapshotNodeScopedVariables(runContext, stepKey)
      options?.onStepComplete?.({
        position: step.position,
        stepKey,
        actionType: step.actionType,
        applied: true,
        branchResult: ok ? 'then' : 'else',
      })
      const thenRef = readString(step.config, 'thenTargetKey') || readString(step.config, 'thenGoToLabel')
      const elseRef = readString(step.config, 'elseTargetKey') || readString(step.config, 'elseGoToLabel')
      const targetRef = ok ? thenRef : elseRef
      if (targetRef) {
        const j = resolveStepIndex(sorted, targetRef)
        if (j >= 0) {
          i = j
          continue
        }
      }
      i++
      continue
    }

    if (isSideEffectAction(step.actionType)) {
      if (sideEffectDone.has(step.position)) {
        // Ya se ejecutó este paso con efectos en este run: no repetir (back-edge).
        runContext.variables.stepApplied = 'false'
        options?.onStepComplete?.({
          position: step.position,
          stepKey,
          actionType: step.actionType,
          applied: false,
          error: 'paso con efectos ya ejecutado en este run (se omite la repetición)',
        })
        i++
        continue
      }
      sideEffectDone.add(step.position)
    }

    await runMemberCreatedStepAction(step, member, runContext, triggerType)
    snapshotNodeScopedVariables(runContext, stepKey)
    const stepErr = runContext.variables.stepError?.trim()
    options?.onStepComplete?.({
      position: step.position,
      stepKey,
      actionType: step.actionType,
      applied: runContext.variables.stepApplied === 'true',
      error: stepErr || undefined,
    })
    i++
  }

  if (guard >= maxIter) {
    console.warn('[workflow] Bucle de pasos detenido por límite de seguridad')
  }
}

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

export async function runWorkflowsForMemberByTrigger(
  memberId: string,
  triggerType: WorkflowTriggerType,
  triggerContext: WorkflowTriggerContext = {},
) {
  const memberRow = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      sportPreference: true,
      guardianName: true,
      guardianPhone: true,
      dni: true,
      birthDate: true,
      status: true,
      registrationExtra: true,
    },
  })

  if (!memberRow) return

  const member = memberRowToPayload(memberRow)

  const workflows = (await prisma.workflow.findMany({
    where: { isActive: true },
    include: { steps: true },
  })).filter((w) => workflowMatchesTrigger(w, triggerType))

  for (const workflow of workflows) {
    if (
      triggerType === 'MEMBER_STATUS_CHANGED' &&
      !memberStatusChangeMatches(workflow.triggerConfig, triggerContext, member.status)
    ) {
      continue
    }
    await runWorkflowStepsForMember(workflow.steps, member, triggerType, triggerContext)
  }
}

export async function runMemberCreatedWorkflows(memberId: string) {
  await runWorkflowsForMemberByTrigger(memberId, 'MEMBER_CREATED')
}

/** Cambio de grupo confirmado o re-instalación en plantilla (sin repetir alta). */
export async function runTeamRosterConfirmedWorkflows(
  memberId: string,
  context: Pick<WorkflowTriggerContext, 'rosterTeamId'> = {},
) {
  await runWorkflowsForMemberByTrigger(memberId, 'TEAM_ROSTER_CONFIRMED', context)
}

export async function runMemberUpdatedWorkflows(memberId: string) {
  await runWorkflowsForMemberByTrigger(memberId, 'MEMBER_UPDATED')
}

export async function runMemberStatusChangedWorkflows(
  memberId: string,
  context: { previousStatus?: string | null; currentStatus?: string | null } = {},
) {
  await runWorkflowsForMemberByTrigger(memberId, 'MEMBER_STATUS_CHANGED', context)
}

export async function runPaymentCreatedWorkflows(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      memberId: true,
      amount: true,
      month: true,
      year: true,
      status: true,
      paidAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (!payment) return
  await runWorkflowsForMemberByTrigger(payment.memberId, 'PAYMENT_CREATED', { payment })
}

export async function runPaymentPaidWorkflows(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      memberId: true,
      amount: true,
      month: true,
      year: true,
      status: true,
      paidAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  if (!payment) return
  await runWorkflowsForMemberByTrigger(payment.memberId, 'PAYMENT_PAID', { payment })
}

export async function loadMemberPayload(memberId: string): Promise<WorkflowMemberPayload | null> {
  const memberRow = await prisma.member.findUnique({
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
  if (!memberRow) return null
  return memberRowToPayload(memberRow)
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

export async function runInvoiceCreatedWorkflows(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      memberId: true,
      invoiceNumber: true,
      totalAmount: true,
      paidAmount: true,
      currency: true,
      status: true,
      dueDate: true,
      whopCheckoutUrl: true,
    },
  })
  if (!invoice) return
  await runWorkflowsForMemberByTrigger(invoice.memberId, 'INVOICE_CREATED', { invoice })
}

/**
 * Alta de un socio con una cuota que exige pago para completarse.
 *
 * A diferencia de `INVOICE_CREATED` (que se dispara también en cada cuota
 * mensual), este evento es solo el del alta, y llega con el **enlace de cobro ya
 * generado**: así un flujo puede mandarlo por WhatsApp con un único paso, sin
 * tener que encadenar antes una acción que lo cree.
 */
export async function runEnrollmentPaymentDueWorkflows(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      memberId: true,
      invoiceNumber: true,
      totalAmount: true,
      paidAmount: true,
      currency: true,
      status: true,
      dueDate: true,
      whopCheckoutUrl: true,
    },
  })
  if (!invoice) return

  // El enlace se genera por adelantado. Si no se consigue, NO se ejecuta el flujo:
  // el sentido de este evento es mandar un enlace de pago, y un mensaje con el
  // hueco en blanco ("Puedes pagarla aquí:" seguido de nada) es peor que ninguno.
  let checkoutUrl = ''
  try {
    const { createInvoiceCheckoutUrl } = await import('@/lib/payments/invoice-checkout')
    const link = await createInvoiceCheckoutUrl(invoice.id)
    if (link.ok) checkoutUrl = link.url
    else console.warn('[workflow] alta con pago: sin enlace de cobro —', link.error)
  } catch (e) {
    console.warn('[workflow] alta con pago: no se pudo generar el enlace', e)
  }
  if (!checkoutUrl) {
    console.warn('[workflow] alta con pago: flujo omitido (la pasarela no devolvió enlace)')
    return
  }

  await runWorkflowsForMemberByTrigger(invoice.memberId, 'ENROLLMENT_PAYMENT_DUE', {
    invoice: { ...invoice, whopCheckoutUrl: checkoutUrl },
  })
}

export async function runInvoicePaidWorkflows(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      memberId: true,
      invoiceNumber: true,
      totalAmount: true,
      paidAmount: true,
      currency: true,
      status: true,
      dueDate: true,
      whopCheckoutUrl: true,
    },
  })
  if (!invoice) return
  await runWorkflowsForMemberByTrigger(invoice.memberId, 'INVOICE_PAID', { invoice })
}

export async function runInvoiceOverdueWorkflows(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      memberId: true,
      invoiceNumber: true,
      totalAmount: true,
      paidAmount: true,
      currency: true,
      status: true,
      dueDate: true,
      whopCheckoutUrl: true,
    },
  })
  if (!invoice) return
  await runWorkflowsForMemberByTrigger(invoice.memberId, 'INVOICE_OVERDUE', { invoice })
}

export async function runSubscriptionCreatedWorkflows(subscriptionId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: { memberId: true },
  })
  if (!sub) return
  await runWorkflowsForMemberByTrigger(sub.memberId, 'SUBSCRIPTION_CREATED')
}

export async function runLeadCreatedWorkflows(leadId: string) {
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
  if (!lead) return
  if (lead.memberId) {
    const member = await loadMemberPayload(lead.memberId)
    if (member) {
      await runWorkflowsForMemberByTrigger(lead.memberId, 'LEAD_CREATED')
      return
    }
  }
  const workflows = await prisma.workflow.findMany({
    where: { isActive: true, triggerType: 'LEAD_CREATED' },
    include: { steps: true },
  })
  const pseudo = leadAsMember(lead)
  for (const workflow of workflows) {
    await runWorkflowStepsForMember(workflow.steps, pseudo, 'LEAD_CREATED', {})
  }
}

export async function runLeadUpdatedWorkflows(leadId: string) {
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
  if (!lead) return
  if (lead.memberId) {
    await runWorkflowsForMemberByTrigger(lead.memberId, 'LEAD_UPDATED')
    return
  }
  const workflows = await prisma.workflow.findMany({
    where: { isActive: true, triggerType: 'LEAD_UPDATED' },
    include: { steps: true },
  })
  const pseudo = leadAsMember(lead)
  for (const workflow of workflows) {
    await runWorkflowStepsForMember(workflow.steps, pseudo, 'LEAD_UPDATED', {})
  }
}

async function runEventTeamWorkflows(
  eventId: string,
  triggerType: Extract<
    WorkflowTriggerType,
    'EVENT_CANCELLED' | 'EVENT_RESCHEDULED' | 'EVENT_STARTING_SOON' | 'EVENT_COMPLETED'
  >,
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, groupId: true, date: true },
  })
  if (!event) return

  const allWorkflows = await prisma.workflow.findMany({
    where: { isActive: true },
    include: { steps: true },
  })
  const workflows = allWorkflows.filter((w) => workflowMatchesTrigger(w, triggerType))

  const eventFull = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, groupId: true, date: true, location: true },
  })

  const stubMember: WorkflowMemberPayload = {
    id: 'event',
    name: event.title,
    email: null,
    phone: null,
    guardianName: null,
    guardianPhone: null,
    address: null,
    sportPreference: null,
    dni: null,
    birthDate: null,
    status: 'ACTIVE',
    registrationExtra: null,
  }

  const ctx: WorkflowTriggerContext = {
    event: {
      id: eventFull?.id || event.id,
      title: eventFull?.title || event.title,
      groupId: eventFull?.groupId ?? event.groupId,
      date: eventFull?.date || event.date,
    },
    eventLocation: eventFull?.location || '',
  }

  if (event.groupId) {
    const captain = await prisma.groupMembership.findFirst({
      where: { groupId: event.groupId, role: 'COACH' },
      select: { memberId: true },
    })
    if (captain?.memberId) {
      const coach = await loadMemberPayload(captain.memberId)
      if (coach) {
        for (const workflow of workflows) {
          await runWorkflowStepsForMember(workflow.steps, coach, triggerType, ctx)
        }
        return
      }
    }
  }

  for (const workflow of workflows) {
    await runWorkflowStepsForMember(workflow.steps, stubMember, triggerType, ctx)
  }
}

export async function runEventCancelledWorkflows(eventId: string) {
  await runEventTeamWorkflows(eventId, 'EVENT_CANCELLED')
}

export async function runEventRescheduledWorkflows(eventId: string) {
  await runEventTeamWorkflows(eventId, 'EVENT_RESCHEDULED')
}

export async function runEventStartingSoonWorkflows(eventId: string) {
  await runEventTeamWorkflows(eventId, 'EVENT_STARTING_SOON')
}

export async function runEventCompletedWorkflows(eventId: string) {
  await runEventTeamWorkflows(eventId, 'EVENT_COMPLETED')
}

/** Horarios fijos del grupo guardados o eliminados (WD-2). */
export async function runTeamScheduleChangedWorkflows(groupId: string) {
  const cleanTeamId = groupId.trim()
  if (!cleanTeamId) return

  const team = await prisma.group.findUnique({
    where: { id: cleanTeamId },
    select: { id: true, name: true },
  })
  if (!team) return

  const workflows = await prisma.workflow.findMany({
    where: { isActive: true, triggerType: 'TEAM_SCHEDULE_CHANGED' },
    include: { steps: true },
  })
  if (workflows.length === 0) return

  const stubMember: WorkflowMemberPayload = {
    id: 'schedule',
    name: team.name,
    email: null,
    phone: null,
    guardianName: null,
    guardianPhone: null,
    address: null,
    sportPreference: null,
    dni: null,
    birthDate: null,
    status: 'ACTIVE',
    registrationExtra: null,
  }

  const ctx: WorkflowTriggerContext = { scheduleTeamId: cleanTeamId }

  for (const workflow of workflows) {
    await runWorkflowStepsForMember(workflow.steps, stubMember, 'TEAM_SCHEDULE_CHANGED', ctx)
  }
}

export async function runAttendanceAbsentUnexcusedWorkflows(attendanceId: string) {
  const row = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: { memberId: true, status: true, reason: true },
  })
  if (!row || row.status !== 'ABSENT') return
  if (row.reason && row.reason.trim()) return
  await runWorkflowsForMemberByTrigger(row.memberId, 'ATTENDANCE_ABSENT_UNEXCUSED')
}

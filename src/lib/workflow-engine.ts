import { prisma } from '@/lib/prisma'
import { sendApiWassText } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'

export type WorkflowMemberPayload = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  sportPreference: string | null
  dni: string | null
  birthDate: Date | null
  status: string
}

type WorkflowRunContext = {
  variables: Record<string, string>
  teamNameCache: Map<string, string>
}

function defaultWorkflowVariables() {
  return {
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
    memberAddress: member.address ?? '',
    memberDni: member.dni ?? '',
    memberStatus: member.status ?? '',
    memberSportPreference: member.sportPreference ?? '',
    memberAge,
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
): Promise<void> {
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

  async function resolveTeamName(teamId: string) {
    const cached = runContext.teamNameCache.get(teamId)
    if (cached) return cached
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { name: true },
    })
    const name = String(team?.name || '')
    if (name) runContext.teamNameCache.set(teamId, name)
    return name
  }

  async function setAssignedTeamResult(teamId: string | null, applied: boolean) {
    const cleanId = String(teamId || '').trim()
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
    if (applied) runContext.variables.stepError = ''
  }

  if (step.actionType === 'ASSIGN_TEAM_BY_AGE') {
    if (!member.birthDate) {
      await setAssignedTeamResult(null, false)
      return
    }

    const maxAge = readNumber(step.config, 'maxAge')
    const minAge = readNumber(step.config, 'minAge')
    const teamId = readString(step.config, 'teamId')
    if (!teamId) {
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

    await prisma.teamMember.upsert({
      where: {
        teamId_memberId: {
          teamId,
          memberId: member.id,
        },
      },
      update: { role: 'PLAYER' },
      create: { teamId, memberId: member.id, role: 'PLAYER' },
    })
    await setAssignedTeamResult(teamId, true)
    return
  }

  if (step.actionType === 'ASSIGN_TEAM') {
    const teamId = readString(step.config, 'teamId')
    if (!teamId) {
      await setAssignedTeamResult(null, false)
      return
    }

    await prisma.teamMember.upsert({
      where: {
        teamId_memberId: {
          teamId,
          memberId: member.id,
        },
      },
      update: { role: 'PLAYER' },
      create: { teamId, memberId: member.id, role: 'PLAYER' },
    })
    await setAssignedTeamResult(teamId, true)
    return
  }

  if (step.actionType === 'ASSIGN_TEAM_BY_PREFERENCE') {
    const key = normalizeText(member.sportPreference)
    if (!key) {
      await setAssignedTeamResult(null, false)
      return
    }
    const map = parsePreferenceMap(step.config)
    const teamId = map[key]
    if (!teamId) {
      await setAssignedTeamResult(null, false)
      return
    }
    await prisma.teamMember.upsert({
      where: {
        teamId_memberId: {
          teamId,
          memberId: member.id,
        },
      },
      update: { role: 'PLAYER' },
      create: { teamId, memberId: member.id, role: 'PLAYER' },
    })
    await setAssignedTeamResult(teamId, true)
    return
  }

  if (step.actionType === 'REMOVE_FROM_TEAM') {
    const teamId = readString(step.config, 'teamId')
    if (teamId) {
      await prisma.teamMember.deleteMany({
        where: {
          memberId: member.id,
          teamId,
        },
      })
    } else {
      await prisma.teamMember.deleteMany({
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
    runContext.variables.stepCreatedSignupLinkExpiresAt = link.expiresAt.toISOString()
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
    const phone = interpolateHttpTemplate(phoneTpl, member, runContext).replace(/[^\d+]/g, '')
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

async function runWorkflowStepsForMember(
  steps: { position: number; stepType: string; actionType: string; config: unknown }[],
  member: WorkflowMemberPayload,
) {
  const runContext: WorkflowRunContext = {
    variables: defaultWorkflowVariables(),
    teamNameCache: new Map<string, string>(),
  }
  const sorted = [...steps].sort((a, b) => a.position - b.position)
  const maxIter = Math.max(sorted.length * 25, 50)
  let i = 0
  let guard = 0

  while (i < sorted.length && guard++ < maxIter) {
    const step = sorted[i]
    runContext.variables.stepPosition = String(step.position)
    runContext.variables.stepLabel = readString(step.config, 'label') || ''
    setStepActionBase(runContext, step.actionType)

    if (step.actionType === 'BRANCH_IF') {
      const ok = evalBranchCondition(step.config, member, runContext)
      runContext.variables.stepApplied = 'true'
      runContext.variables.stepBranchResult = ok ? 'then' : 'else'
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

    await runMemberCreatedStepAction(step, member, runContext)
    i++
  }

  if (guard >= maxIter) {
    console.warn('[workflow] Bucle de pasos detenido por límite de seguridad')
  }
}

async function runWorkflowsForMemberByTrigger(
  memberId: string,
  triggerType:
    | 'MEMBER_CREATED'
    | 'MEMBER_UPDATED'
    | 'MEMBER_STATUS_CHANGED'
    | 'PAYMENT_CREATED'
    | 'PAYMENT_PAID',
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
      dni: true,
      birthDate: true,
      status: true,
    },
  })

  if (!memberRow) return

  const member: WorkflowMemberPayload = {
    id: memberRow.id,
    name: memberRow.name,
    email: memberRow.email,
    phone: memberRow.phone,
    address: memberRow.address,
    sportPreference: memberRow.sportPreference,
    dni: memberRow.dni,
    birthDate: memberRow.birthDate,
    status: memberRow.status,
  }

  const workflows = await prisma.workflow.findMany({
    where: { isActive: true, triggerType },
    include: { steps: true },
  })

  for (const workflow of workflows) {
    await runWorkflowStepsForMember(workflow.steps, member)
  }
}

export async function runMemberCreatedWorkflows(memberId: string) {
  await runWorkflowsForMemberByTrigger(memberId, 'MEMBER_CREATED')
}

export async function runMemberUpdatedWorkflows(memberId: string) {
  await runWorkflowsForMemberByTrigger(memberId, 'MEMBER_UPDATED')
}

export async function runMemberStatusChangedWorkflows(memberId: string) {
  await runWorkflowsForMemberByTrigger(memberId, 'MEMBER_STATUS_CHANGED')
}

export async function runPaymentCreatedWorkflows(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { memberId: true },
  })
  if (!payment) return
  await runWorkflowsForMemberByTrigger(payment.memberId, 'PAYMENT_CREATED')
}

export async function runPaymentPaidWorkflows(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { memberId: true },
  })
  if (!payment) return
  await runWorkflowsForMemberByTrigger(payment.memberId, 'PAYMENT_PAID')
}

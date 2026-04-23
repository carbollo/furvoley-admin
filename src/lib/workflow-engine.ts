import { prisma } from '@/lib/prisma'

export type WorkflowMemberPayload = {
  id: string
  name: string
  email: string | null
  phone: string | null
  dni: string | null
  birthDate: Date | null
  status: string
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

function interpolateHttpTemplate(template: string, member: WorkflowMemberPayload): string {
  const map: Record<string, string> = {
    memberId: member.id,
    memberName: member.name ?? '',
    memberEmail: member.email ?? '',
    memberPhone: member.phone ?? '',
    memberDni: member.dni ?? '',
    memberStatus: member.status ?? '',
  }
  return template.replace(/\{(\w+)\}/g, (_, key) => map[key] ?? `{${key}}`)
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

function evalBranchCondition(
  config: unknown,
  member: WorkflowMemberPayload,
): boolean {
  const field = readString(config, 'ifField')
  const op = readString(config, 'ifOperator') || 'eq'
  const compareRaw = readString(config, 'ifValue')
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
): Promise<void> {
  if (step.actionType === 'ASSIGN_TEAM_BY_AGE') {
    if (!member.birthDate) return

    const maxAge = readNumber(step.config, 'maxAge')
    const minAge = readNumber(step.config, 'minAge')
    const teamId = readString(step.config, 'teamId')
    if (!teamId) return

    const age = calculateAge(member.birthDate)
    if (minAge !== null && age < minAge) return
    if (maxAge !== null && age > maxAge) return

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
    return
  }

  if (step.actionType === 'ASSIGN_TEAM') {
    const teamId = readString(step.config, 'teamId')
    if (!teamId) return

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
    return
  }

  if (step.actionType === 'SET_MEMBER_STATUS') {
    const targetStatus = readString(step.config, 'targetStatus')
    if (!targetStatus) return

    if (member.status !== targetStatus) {
      await prisma.member.update({
        where: { id: member.id },
        data: { status: targetStatus },
      })
      member.status = targetStatus
    }
    return
  }

  if (step.actionType === 'CREATE_PAYMENT') {
    const amount = readNumber(step.config, 'amount')
    if (amount === null || amount <= 0) return

    const monthOffset = readNumber(step.config, 'monthOffset') ?? 0
    const { month, year } = toPeriodWithOffset(new Date(), Math.trunc(monthOffset))
    const paymentStatus = readString(step.config, 'paymentStatus') || 'PENDING'

    await prisma.payment.create({
      data: {
        memberId: member.id,
        amount,
        month,
        year,
        status: paymentStatus,
      },
    })
    return
  }

  if (step.actionType === 'HTTP_REQUEST') {
    const url = readString(step.config, 'httpUrl')
    const method = (readString(step.config, 'httpMethod') || 'GET').toUpperCase()
    if (!url || !isAllowedHttpUrl(url)) {
      console.warn('[workflow] HTTP_REQUEST URL no permitida:', url)
      return
    }
    const httpDisabled =
      process.env.WORKFLOW_HTTP_DISABLED === '1' || process.env.WORKFLOW_HTTP_DISABLED === 'true'
    if (httpDisabled) {
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
      body = interpolateHttpTemplate(bodyTpl, member)
      const hasCt = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
      if (!hasCt) headers['Content-Type'] = 'application/json'
    }

    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 15_000)
    try {
      await fetch(url, {
        method,
        headers,
        body: body ?? undefined,
        signal: ac.signal,
      })
    } catch (e) {
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
  const sorted = [...steps].sort((a, b) => a.position - b.position)
  const maxIter = Math.max(sorted.length * 25, 50)
  let i = 0
  let guard = 0

  while (i < sorted.length && guard++ < maxIter) {
    const step = sorted[i]

    if (step.actionType === 'BRANCH_IF') {
      const ok = evalBranchCondition(step.config, member)
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

    await runMemberCreatedStepAction(step, member)
    i++
  }

  if (guard >= maxIter) {
    console.warn('[workflow] Bucle de pasos detenido por límite de seguridad')
  }
}

export async function runMemberCreatedWorkflows(memberId: string) {
  const memberRow = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
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
    dni: memberRow.dni,
    birthDate: memberRow.birthDate,
    status: memberRow.status,
  }

  const workflows = await prisma.workflow.findMany({
    where: { isActive: true, triggerType: 'MEMBER_CREATED' },
    include: { steps: true },
  })

  for (const workflow of workflows) {
    await runWorkflowStepsForMember(workflow.steps, member)
  }
}

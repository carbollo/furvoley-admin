import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

export type WorkflowLinkType =
  | 'ATTENDANCE'
  | 'ATTENDANCE_REASON'
  | 'CONVOCATION'
  | 'TRIAL'
  | 'MATCH_RESULT'
  | 'CONSENT'
  | 'LEAVE_SURVEY'
  | 'SEASON_RENEWAL'

const ROUTE_BY_TYPE: Record<WorkflowLinkType, string> = {
  ATTENDANCE: 'attendance',
  ATTENDANCE_REASON: 'attendance',
  CONVOCATION: 'convocation',
  TRIAL: 'trial',
  MATCH_RESULT: 'match-result',
  CONSENT: 'consent',
  LEAVE_SURVEY: 'leave-survey',
  SEASON_RENEWAL: 'renewal',
}

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

export function buildResponseLinkUrl(token: string, type: WorkflowLinkType) {
  const segment = ROUTE_BY_TYPE[type] || 'link'
  return `${appBaseUrl()}/r/${segment}/${token}`
}

export async function createWorkflowResponseLink(input: {
  type: WorkflowLinkType
  memberId?: string | null
  eventId?: string | null
  teamId?: string | null
  payload?: Record<string, unknown>
  expiresInHours?: number
}) {
  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + (input.expiresInHours ?? 72) * 60 * 60 * 1000)
  const row = await prisma.workflowResponseToken.create({
    data: {
      token,
      type: input.type,
      memberId: input.memberId || null,
      eventId: input.eventId || null,
      teamId: input.teamId || null,
      payload: input.payload ? (input.payload as object) : undefined,
      expiresAt,
    },
  })
  return {
    id: row.id,
    token: row.token,
    url: buildResponseLinkUrl(row.token, input.type as WorkflowLinkType),
    expiresAt: row.expiresAt,
  }
}

/** Lectura del token (formulario público); no marca como usado. */
export async function getWorkflowResponseToken(token: string) {
  const row = await prisma.workflowResponseToken.findUnique({ where: { token } })
  if (!row) return { ok: false as const, error: 'Enlace no válido' }
  if (row.expiresAt < new Date()) return { ok: false as const, error: 'Enlace caducado' }
  return { ok: true as const, row, used: !!row.usedAt }
}

export async function consumeWorkflowResponseToken(token: string) {
  const peek = await getWorkflowResponseToken(token)
  if (!peek.ok) return peek
  if (peek.used) return { ok: false as const, error: 'Enlace ya utilizado' }
  return { ok: true as const, row: peek.row }
}

export async function markWorkflowResponseTokenUsed(token: string) {
  await prisma.workflowResponseToken.update({
    where: { token },
    data: { usedAt: new Date() },
  })
}

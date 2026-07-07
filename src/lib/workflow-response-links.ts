import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'
import { isHexToken } from '@/lib/db-input-validation'
import { currentTenant } from '@/lib/multitenant/context'
import { isMultiTenant } from '@/lib/multitenant/registry'

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
  const explicit = String(process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (explicit) return explicit
  const railway = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim()
  if (railway) return (railway.startsWith('http') ? railway : `https://${railway}`).replace(/\/+$/, '')
  return 'http://localhost:3000'
}

/**
 * URL pública del enlace de respuesta. En multi-tenant DEBE codificar el tenant
 * (el token vive en la BD del tenant): con dominio comodín → subdominio
 * `slug.dominio`; sin él (pruebas) → `?tenant=slug` para que el middleware lo
 * resuelva por override. En un-solo-club → URL base a secas.
 */
export function buildResponseLinkUrl(token: string, type: WorkflowLinkType) {
  const segment = ROUTE_BY_TYPE[type] || 'link'
  const path = `/r/${segment}/${token}`

  const slug = currentTenant()?.slug
  if (isMultiTenant() && slug) {
    const base = String(process.env.TENANT_BASE_DOMAIN || '')
      .trim().toLowerCase().replace(/^\.+|\.+$/g, '')
    if (base) return `https://${slug}.${base}${path}`
    return `${appBaseUrl()}${path}?tenant=${encodeURIComponent(slug)}`
  }
  return `${appBaseUrl()}${path}`
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
  if (!isHexToken(token)) return { ok: false as const, error: 'Enlace no válido' }
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

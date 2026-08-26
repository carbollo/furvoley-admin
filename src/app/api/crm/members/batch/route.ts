import { NextResponse } from 'next/server'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'
import { runMembersBatchAction, type BatchAction } from '@/lib/members-batch-actions'

export const dynamic = 'force-dynamic'

const ACTIONS = new Set<BatchAction>([
  'delete',
  'reset-portal-access',
  'set-status',
  'send-payment-reminder',
  'assign-plan',
  'send-message',
  'add-to-group',
])

/**
 * Acciones que también puede hacer el TREASURER.
 *
 * Reclamar un impago y asignar cuotas SON su trabajo, y exigir ADMIN para todo
 * el endpoint le dejaba fuera de las dos pantallas que más usa, con un escueto
 * «Unauthorized». Borrar socios o resetear accesos siguen siendo de ADMIN.
 */
const TREASURER_ACTIONS = new Set<BatchAction>(['send-payment-reminder', 'assign-plan'])

export async function POST(request: Request) {
  // Se autoriza primero como staff y luego se afina por acción: así el rol se
  // comprueba sabiendo ya qué se pretende hacer.
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  let body: {
    memberIds?: string[]
    action?: string
    status?: string
    planId?: string
    startDate?: string
    autoPay?: boolean
    paymentRequiredOnEnrollment?: boolean
    message?: string
    groupId?: string
    groupRole?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const action = String(body.action || '').trim() as BatchAction
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 })
  }

  if (auth.role !== 'ADMIN' && !TREASURER_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: 'Esta acción solo puede hacerla un administrador del club.' },
      { status: 403 },
    )
  }

  const rawIds = Array.isArray(body.memberIds) ? body.memberIds : []
  const memberIds: string[] = []
  for (const raw of rawIds) {
    const parsed = parseCuid(String(raw || '').trim(), 'memberId')
    if (parsed instanceof Response) return parsed
    memberIds.push(parsed)
  }

  const result = await runMembersBatchAction(memberIds, action, {
    status: body.status,
    planId: body.planId,
    startDate: body.startDate,
    autoPay: body.autoPay,
    paymentRequiredOnEnrollment: body.paymentRequiredOnEnrollment,
    message: body.message,
    groupId: body.groupId,
    groupRole: body.groupRole,
  })
  return NextResponse.json(result)
}

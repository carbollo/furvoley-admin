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

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'])
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

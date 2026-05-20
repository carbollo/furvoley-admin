import { NextResponse } from 'next/server'
import { setTeamCoach } from '@/app/actions/teams'
import { requireRoles } from '@/lib/rbac-api'
import { runCoachAssignedWorkflows } from '@/lib/workflow-proclub-runners'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id: teamId } = await context.params
  let body: { memberId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const memberId = String(body.memberId || '').trim()
  if (!memberId) {
    return NextResponse.json({ error: 'memberId es obligatorio' }, { status: 400 })
  }

  try {
    await setTeamCoach(teamId, memberId)
  } catch {
    return NextResponse.json({ error: 'No se pudo asignar el entrenador' }, { status: 400 })
  }

  void runCoachAssignedWorkflows(teamId, memberId).catch((err) => {
    console.warn('[coach] WD-14 workflow failed:', err)
  })

  return NextResponse.json({ ok: true })
}

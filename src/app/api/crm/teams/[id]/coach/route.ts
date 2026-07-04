import { NextResponse } from 'next/server'
import { setTeamCoach, setTeamCoachFromUser } from '@/app/actions/teams'
import { parseCuid } from '@/lib/db-input-validation'
import { assertTeamAccess, requireRoles } from '@/lib/rbac-api'
import { runCoachAssignedWorkflows } from '@/lib/workflow-proclub-runners'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  const { id: teamId } = await context.params
  const parsedTeamId = parseCuid(teamId, 'teamId')
  if (parsedTeamId instanceof Response) return parsedTeamId

  const denied = await assertTeamAccess(auth, parsedTeamId)
  if (denied) return denied

  let body: { memberId?: string; userId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const memberId = String(body.memberId || '').trim()
  const userId = String(body.userId || '').trim()
  if (!memberId && !userId) {
    return NextResponse.json({ error: 'Indica un socio (memberId) o una cuenta de personal (userId)' }, { status: 400 })
  }

  let coachMemberId = memberId
  try {
    if (userId) {
      const parsedUserId = parseCuid(userId, 'userId')
      if (parsedUserId instanceof Response) return parsedUserId
      coachMemberId = await setTeamCoachFromUser(parsedTeamId, parsedUserId)
    } else {
      await setTeamCoach(parsedTeamId, memberId)
    }
  } catch {
    return NextResponse.json({ error: 'No se pudo asignar el entrenador' }, { status: 400 })
  }

  void runCoachAssignedWorkflows(parsedTeamId, coachMemberId).catch((err) => {
    console.warn('[coach] WD-14 workflow failed:', err)
  })

  return NextResponse.json({ ok: true })
}

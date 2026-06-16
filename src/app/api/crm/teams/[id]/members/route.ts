import { NextResponse } from 'next/server'
import { addTeamMember } from '@/app/actions/teams'
import { parseCuid } from '@/lib/db-input-validation'
import { assertTeamAccess, requireRoles } from '@/lib/rbac-api'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id: teamId } = await context.params
  const parsedTeamId = parseCuid(teamId, 'teamId')
  if (parsedTeamId instanceof Response) return parsedTeamId

  const denied = await assertTeamAccess(auth, parsedTeamId)
  if (denied) return denied

  let body: { memberId?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const memberId = String(body.memberId || '').trim()
  if (!memberId) {
    return NextResponse.json({ error: 'memberId es obligatorio' }, { status: 400 })
  }

  const r = String(body.role || 'PLAYER').toUpperCase()
  const dbRole = r === 'COACH' ? 'COACH' : 'PLAYER'

  try {
    await addTeamMember({ teamId: parsedTeamId, memberId, role: dbRole })
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'code' in e && e.code === 'P2002'
      ? 'Ese socio ya está en el equipo'
      : 'No se pudo añadir al socio'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { removeTeamMember } from '@/app/actions/teams'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { assertTeamAccess, requireRoles } from '@/lib/rbac-api'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'COACH'], _request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  // El id es de TeamMember; resolvemos su equipo para comprobar acceso del COACH.
  const teamMember = await prisma.teamMember.findUnique({
    where: { id: parsedId },
    select: { teamId: true },
  })
  if (!teamMember) {
    return NextResponse.json({ error: 'No se pudo quitar del equipo' }, { status: 404 })
  }
  const denied = await assertTeamAccess(auth, teamMember.teamId)
  if (denied) return denied

  try {
    await removeTeamMember(parsedId)
  } catch {
    return NextResponse.json({ error: 'No se pudo quitar del equipo' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

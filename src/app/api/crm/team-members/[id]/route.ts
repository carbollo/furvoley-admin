import { NextResponse } from 'next/server'
import { removeTeamMember } from '@/app/actions/teams'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  try {
    await removeTeamMember(parsedId)
  } catch {
    return NextResponse.json({ error: 'No se pudo quitar del equipo' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

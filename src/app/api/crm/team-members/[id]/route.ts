import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { removeTeamMember } from '@/app/actions/teams'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params

  try {
    await removeTeamMember(id)
  } catch {
    return NextResponse.json({ error: 'No se pudo quitar del equipo' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

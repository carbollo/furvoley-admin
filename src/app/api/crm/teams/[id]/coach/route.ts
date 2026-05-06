import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setTeamCoach } from '@/app/actions/teams'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createEvent } from '@/app/actions/events'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    title?: string
    type?: string
    date?: string
    location?: string
    teamId?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const title = String(body.title || '').trim()
  const teamId = String(body.teamId || '').trim()
  if (!title || !teamId) {
    return NextResponse.json({ error: 'Título y equipo son obligatorios' }, { status: 400 })
  }

  const date = body.date ? new Date(body.date) : new Date()
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }

  await createEvent({
    title,
    type: body.type?.trim() || 'OTHER',
    date,
    location: body.location?.trim() || undefined,
    teamId,
  })

  return NextResponse.json({ ok: true })
}

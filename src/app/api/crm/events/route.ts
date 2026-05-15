import { NextResponse } from 'next/server'
import { createEvent } from '@/app/actions/events'
import { requireRoles } from '@/lib/rbac-api'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

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

import { NextResponse } from 'next/server'
import { createEvent } from '@/app/actions/events'
import { parseCuid } from '@/lib/db-input-validation'
import { assertTeamAccess, requireRoles } from '@/lib/rbac-api'
import { scheduleAttendanceForm, type AttendanceLinkResult } from '@/lib/attendance-link'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  let body: {
    title?: string
    type?: string
    date?: string
    location?: string
    description?: string
    teamId?: string
    teamIds?: string[]
    scheduleAttendanceForm?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const title = String(body.title || '').trim()
  // Acciones en lote (roadmap · Módulo 2.1): admite varios equipos a la vez.
  // Compatibilidad: teamId único sigue funcionando.
  const rawTeamIds = Array.isArray(body.teamIds) && body.teamIds.length > 0
    ? body.teamIds
    : [body.teamId]
  const teamIds: string[] = []
  for (const raw of rawTeamIds) {
    const value = String(raw || '').trim()
    if (!value) continue
    const parsed = parseCuid(value, 'teamId')
    if (parsed instanceof Response) return parsed
    if (!teamIds.includes(parsed)) teamIds.push(parsed)
  }
  if (!title || teamIds.length === 0) {
    return NextResponse.json({ error: 'Título y al menos un equipo son obligatorios' }, { status: 400 })
  }

  const date = body.date ? new Date(body.date) : new Date()
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }

  // Un COACH solo puede crear eventos en los equipos que entrena.
  for (const teamId of teamIds) {
    const denied = await assertTeamAccess(auth, teamId)
    if (denied) return denied
  }

  const description = String(body.description || '').trim() || undefined
  const wantAttendance = body.scheduleAttendanceForm === true

  const attendanceLinks: AttendanceLinkResult[] = []
  let created = 0
  for (const teamId of teamIds) {
    const event = await createEvent({
      title,
      type: body.type?.trim() || 'OTHER',
      date,
      location: body.location?.trim() || undefined,
      description,
      teamId,
    })
    created++
    if (wantAttendance) {
      attendanceLinks.push(await scheduleAttendanceForm(event.id, teamId, title, date))
    }
  }

  return NextResponse.json({ ok: true, created, attendanceLinks })
}

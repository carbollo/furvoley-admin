import { NextResponse } from 'next/server'
import { createEventInternal } from '@/lib/events-service'
import { parseCuid } from '@/lib/db-input-validation'
import { assertTeamAccess, requireRoles } from '@/lib/rbac-api'
import { attendanceFormSendDate, isAttendanceReminderDays } from '@/lib/attendance-link'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  let body: {
    title?: string
    type?: string
    date?: string
    location?: string
    description?: string
    groupId?: string
    teamIds?: string[]
    scheduleAttendanceForm?: boolean
    attendanceReminderDays?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const title = String(body.title || '').trim()
  // Acciones en lote (roadmap · Módulo 2.1): admite varios equipos a la vez.
  // Compatibilidad: groupId único sigue funcionando.
  const rawTeamIds = Array.isArray(body.teamIds) && body.teamIds.length > 0
    ? body.teamIds
    : [body.groupId]
  const teamIds: string[] = []
  for (const raw of rawTeamIds) {
    const value = String(raw || '').trim()
    if (!value) continue
    const parsed = parseCuid(value, 'groupId')
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
  for (const groupId of teamIds) {
    const denied = await assertTeamAccess(auth, groupId)
    if (denied) return denied
  }

  const description = String(body.description || '').trim() || undefined
  const wantAttendance = body.scheduleAttendanceForm === true
  // Días de antelación del formulario (1/3/7/15/30); por defecto 7.
  const reminderDays = wantAttendance
    ? (isAttendanceReminderDays(body.attendanceReminderDays) ? body.attendanceReminderDays : 7)
    : null

  // Solo se PROGRAMA aquí; el envío (masivo por WhatsApp) lo hace el cron
  // /api/jobs/attendance-forms cuando llega `fecha - reminderDays`, incluidos los
  // eventos cuya ventana ya pasó (se envían en el siguiente tick). Así el POST
  // responde rápido y no se duplican envíos si el usuario reintenta.
  const sendAt = reminderDays != null ? attendanceFormSendDate(date, reminderDays) : null

  let created = 0
  for (const groupId of teamIds) {
    await createEventInternal({
      title,
      type: body.type?.trim() || 'OTHER',
      date,
      location: body.location?.trim() || undefined,
      description,
      groupId,
      attendanceFormEnabled: wantAttendance,
      attendanceReminderDays: reminderDays,
    })
    created++
  }

  return NextResponse.json({
    ok: true,
    created,
    attendance: wantAttendance
      ? { reminderDays, sendAt: sendAt?.toISOString() ?? null }
      : null,
  })
}

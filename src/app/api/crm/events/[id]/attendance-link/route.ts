import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { assertTeamAccess, requireRoles } from '@/lib/rbac-api'
import { scheduleAttendanceForm } from '@/lib/attendance-link'

export const dynamic = 'force-dynamic'

/**
 * Genera (o regenera) el enlace-checklist de asistencia de un evento existente
 * y lo envía al entrenador (roadmap · 5.4). Útil si no se marcó la casilla al
 * crear el evento o si el enlace caducó.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'eventId')
  if (parsedId instanceof Response) return parsedId

  const event = await prisma.event.findUnique({
    where: { id: parsedId },
    select: { id: true, title: true, date: true, teamId: true },
  })
  if (!event) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
  if (!event.teamId) {
    return NextResponse.json({ error: 'El evento no tiene equipo asignado' }, { status: 400 })
  }

  const denied = await assertTeamAccess(auth, event.teamId)
  if (denied) return denied

  // Asegura las filas de asistencia (eventos antiguos o plantillas cambiadas).
  const teamMembers = await prisma.teamMember.findMany({ where: { teamId: event.teamId } })
  const existing = await prisma.attendance.findMany({
    where: { eventId: event.id },
    select: { memberId: true },
  })
  const existingIds = new Set(existing.map((a) => a.memberId))
  const missing = teamMembers.filter((tm) => !existingIds.has(tm.memberId))
  if (missing.length > 0) {
    await prisma.attendance.createMany({
      data: missing.map((tm) => ({ eventId: event.id, memberId: tm.memberId, status: 'PENDING' })),
    })
  }

  const result = await scheduleAttendanceForm(event.id, event.teamId, event.title, event.date)
  return NextResponse.json({ ok: true, ...result })
}

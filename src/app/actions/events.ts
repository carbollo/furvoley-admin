'use server'

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { normalizeRole } from '@/lib/rbac'
import { runWithTenant } from '@/lib/multitenant/request'
import { isAttendanceReminderDays } from '@/lib/attendance-link'
import {
  createEventInternal,
  deleteEventInternal,
  updateAttendanceInternal,
  type CreateEventData,
} from '@/lib/events-service'

/**
 * Autorización de los server actions de eventos. Estos actions se exponen como
 * endpoints RPC (los usan componentes 'use client'), así que NO se puede confiar
 * en el gating de la UI: hay que comprobar rol y acceso al equipo aquí.
 *
 * La lógica SIN auth vive en `@/lib/events-service` (módulo sin 'use server', no
 * invocable como RPC). Aquí solo se exponen wrappers que autorizan y activan el
 * tenant por host antes de delegar.
 */
async function assertEventWriter(groupId: string | null | undefined) {
  const session = await getServerSession(authOptions)
  const user = session?.user as { role?: string; memberId?: string | null } | undefined
  const role = normalizeRole(user?.role)
  if (!user || !(role === 'ADMIN' || role === 'COACH')) {
    throw new Error('No autorizado')
  }
  if (role === 'COACH' && groupId) {
    const owns = user.memberId
      ? await prisma.groupMembership.findFirst({
          where: { groupId, memberId: user.memberId, role: 'COACH' },
          select: { id: true },
        })
      : null
    if (!owns) throw new Error('No tienes acceso a este equipo')
  }
}

/**
 * Server action público (lo usa el form de EventForm). Autoriza, valida y
 * activa el tenant antes de delegar en `createEventInternal`.
 */
export async function createEvent(data: CreateEventData) {
  return runWithTenant(async () => {
    await assertEventWriter(data.groupId)
    const attendanceReminderDays = data.attendanceFormEnabled
      ? (isAttendanceReminderDays(data.attendanceReminderDays) ? data.attendanceReminderDays : 7)
      : null
    return createEventInternal({ ...data, attendanceReminderDays })
  })
}

/** Server action público (form de borrado en el calendario): autoriza + tenant. */
export async function deleteEvent(id: string) {
  return runWithTenant(async () => {
    const event = await prisma.event.findUnique({ where: { id }, select: { groupId: true } })
    if (!event) throw new Error('Evento no encontrado')
    await assertEventWriter(event.groupId)
    return deleteEventInternal(id)
  })
}

/**
 * Server action de asistencia (lo usa AttendanceButtons en el calendario del CRM):
 * autoriza como staff (ADMIN/COACH del equipo del evento) + activa tenant. La ruta
 * pública por token (/api/public/workflow-response) NO usa este action: llama a
 * `updateAttendanceInternal` con su propia autorización por token.
 */
export async function updateAttendance(id: string, status: string, reason?: string) {
  return runWithTenant(async () => {
    const attendance = await prisma.attendance.findUnique({
      where: { id },
      select: { eventId: true },
    })
    if (!attendance) throw new Error('Asistencia no encontrada')
    const event = attendance.eventId
      ? await prisma.event.findUnique({ where: { id: attendance.eventId }, select: { groupId: true } })
      : null
    await assertEventWriter(event?.groupId ?? null)
    return updateAttendanceInternal(id, status, reason)
  })
}

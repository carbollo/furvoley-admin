'use server'

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { normalizeRole } from '@/lib/rbac'
import { runWithTenant } from '@/lib/multitenant/request'
import { isAttendanceReminderDays } from '@/lib/attendance-link'
import {
  runAttendanceAbsentUnexcusedWorkflows,
  runEventCancelledWorkflows,
  runEventCompletedWorkflows,
  runEventRescheduledWorkflows,
} from '@/lib/workflow-engine'

/**
 * Autorización de los server actions de eventos. Estos actions se exponen como
 * endpoints RPC (los usan componentes 'use client'), así que NO se puede confiar
 * en el gating de la UI: hay que comprobar rol y acceso al equipo aquí.
 */
async function assertEventWriter(teamId: string | null | undefined) {
  const session = await getServerSession(authOptions)
  const user = session?.user as { role?: string; memberId?: string | null } | undefined
  const role = normalizeRole(user?.role)
  if (!user || !(role === 'ADMIN' || role === 'COACH')) {
    throw new Error('No autorizado')
  }
  if (role === 'COACH' && teamId) {
    const owns = user.memberId
      ? await prisma.teamMember.findFirst({
          where: { teamId, memberId: user.memberId, role: 'COACH' },
          select: { id: true },
        })
      : null
    if (!owns) throw new Error('No tienes acceso a este equipo')
  }
}

// EVENTS
type CreateEventData = {
  title: string
  type: string
  date: Date
  location?: string
  description?: string
  teamId: string
  attendanceFormEnabled?: boolean
  attendanceReminderDays?: number | null
}

/**
 * Alta de evento SIN autorización — solo para llamadas server-to-server ya
 * autorizadas (route handler tras requireRoles, MCP tras su Bearer). No exponer
 * directamente a clientes: usa `createEvent`.
 */
export async function createEventInternal(data: CreateEventData) {
  const event = await prisma.event.create({ data })

  const teamMembers = await prisma.teamMember.findMany({
    where: { teamId: data.teamId },
  })

  if (teamMembers.length > 0) {
    await prisma.attendance.createMany({
      data: teamMembers.map((tm) => ({
        eventId: event.id,
        memberId: tm.memberId,
        status: 'PENDING',
      })),
    })
  }

  revalidatePath('/calendar')
  return event
}

/**
 * Server action público (lo usa el form de EventForm). Autoriza, valida y
 * activa el tenant antes de delegar en `createEventInternal`.
 */
export async function createEvent(data: CreateEventData) {
  return runWithTenant(async () => {
    await assertEventWriter(data.teamId)
    const attendanceReminderDays = data.attendanceFormEnabled
      ? (isAttendanceReminderDays(data.attendanceReminderDays) ? data.attendanceReminderDays : 7)
      : null
    return createEventInternal({ ...data, attendanceReminderDays })
  })
}

export async function updateEvent(
  id: string,
  data: {
    title?: string
    type?: string
    date?: Date
    location?: string
    description?: string
    status?: string
    teamId?: string
  },
) {
  const prev = await prisma.event.findUnique({ where: { id } })
  const event = await prisma.event.update({ where: { id }, data })

  if (data.status === 'CANCELLED' && prev?.status !== 'CANCELLED') {
    await runEventCancelledWorkflows(id)
  }
  if (data.date && prev && data.date.getTime() !== prev.date.getTime()) {
    await runEventRescheduledWorkflows(id)
  }
  if (data.status === 'COMPLETED' && prev?.status !== 'COMPLETED') {
    await runEventCompletedWorkflows(id)
  }

  revalidatePath('/calendar')
  return event
}

/** Baja de evento SIN autorización (server-to-server ya autorizado). */
export async function deleteEventInternal(id: string) {
  await runEventCancelledWorkflows(id)
  await prisma.event.delete({ where: { id } })
  revalidatePath('/calendar')
}

/** Server action público (form de borrado en el calendario): autoriza + tenant. */
export async function deleteEvent(id: string) {
  return runWithTenant(async () => {
    const event = await prisma.event.findUnique({ where: { id }, select: { teamId: true } })
    if (!event) throw new Error('Evento no encontrado')
    await assertEventWriter(event.teamId)
    return deleteEventInternal(id)
  })
}

// ATTENDANCE
export async function updateAttendance(id: string, status: string, reason?: string) {
  const attendance = await prisma.attendance.update({
    where: { id },
    data: { status, reason },
  })
  if (status === 'ABSENT' && !String(reason || '').trim()) {
    await runAttendanceAbsentUnexcusedWorkflows(attendance.id)
  }
  revalidatePath(`/calendar/${attendance.eventId}`)
  return attendance
}

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { effectiveGroupMemberIds } from '@/lib/groups'
import {
  runAttendanceAbsentUnexcusedWorkflows,
  runEventCancelledWorkflows,
  runEventCompletedWorkflows,
  runEventRescheduledWorkflows,
} from '@/lib/workflow-engine'

/**
 * Lógica de eventos/asistencia SIN autorización, para llamadas server-to-server ya
 * autorizadas (route handlers tras requireRoles, MCP tras su Bearer, o los server
 * actions con auth de `@/app/actions/events`).
 *
 * IMPORTANTE: este módulo NO lleva `'use server'` a propósito. Antes estas
 * funciones vivían en un fichero `'use server'`, lo que las exponía como endpoints
 * RPC (server actions) invocables por cualquier cliente SIN pasar por los wrappers
 * autorizados. Al moverlas aquí dejan de ser invocables directamente.
 */

export type CreateEventData = {
  title: string
  type: string
  date: Date
  location?: string
  description?: string
  groupId: string
  attendanceFormEnabled?: boolean
  attendanceReminderDays?: number | null
}

export async function createEventInternal(data: CreateEventData) {
  const event = await prisma.event.create({ data })

  // Filas de asistencia (pase de lista) para los socios EFECTIVOS del grupo
  // (directos + los de sus subgrupos, por contención).
  const memberIds = data.groupId ? await effectiveGroupMemberIds(data.groupId) : []
  if (memberIds.length > 0) {
    await prisma.attendance.createMany({
      data: memberIds.map((memberId) => ({
        eventId: event.id,
        memberId,
        status: 'PENDING',
      })),
    })
  }

  revalidatePath('/calendar')
  return event
}

export async function updateEventInternal(
  id: string,
  data: {
    title?: string
    type?: string
    date?: Date
    location?: string
    description?: string
    status?: string
    groupId?: string
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

export async function deleteEventInternal(id: string) {
  await runEventCancelledWorkflows(id)
  await prisma.event.delete({ where: { id } })
  revalidatePath('/calendar')
}

export async function updateAttendanceInternal(id: string, status: string, reason?: string) {
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

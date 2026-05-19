'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import {
  runAttendanceAbsentUnexcusedWorkflows,
  runEventCancelledWorkflows,
  runEventRescheduledWorkflows,
} from '@/lib/workflow-engine'

// EVENTS
export async function createEvent(data: {
  title: string
  type: string
  date: Date
  location?: string
  description?: string
  teamId: string
}) {
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

export async function updateEvent(
  id: string,
  data: {
    title?: string
    type?: string
    date?: Date
    location?: string
    description?: string
    status?: string
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

  revalidatePath('/calendar')
  return event
}

export async function deleteEvent(id: string) {
  await runEventCancelledWorkflows(id)
  await prisma.event.delete({ where: { id } })
  revalidatePath('/calendar')
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

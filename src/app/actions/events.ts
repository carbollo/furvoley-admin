'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

// EVENTS
export async function createEvent(data: { title: string; type: string; date: Date; location?: string; description?: string; teamId: string }) {
  const event = await prisma.event.create({ data })
  
  // Create pending attendance records for all team members
  const teamMembers = await prisma.teamMember.findMany({
    where: { teamId: data.teamId }
  })

  if (teamMembers.length > 0) {
    await prisma.attendance.createMany({
      data: teamMembers.map(tm => ({
        eventId: event.id,
        memberId: tm.memberId,
        status: 'PENDING'
      }))
    })
  }

  revalidatePath('/calendar')
  return event
}

export async function deleteEvent(id: string) {
  await prisma.event.delete({ where: { id } })
  revalidatePath('/calendar')
}

// ATTENDANCE
export async function updateAttendance(id: string, status: string, reason?: string) {
  const attendance = await prisma.attendance.update({
    where: { id },
    data: { status, reason }
  })
  revalidatePath(`/calendar/${attendance.eventId}`)
  return attendance
}

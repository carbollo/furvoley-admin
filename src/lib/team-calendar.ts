import { prisma } from '@/lib/prisma'

function parseTime(hhmm: string): { hours: number; minutes: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}

function isHoliday(date: Date, holidays: Date[]) {
  const key = date.toISOString().slice(0, 10)
  return holidays.some((h) => h.toISOString().slice(0, 10) === key)
}

/** Genera eventos TRAINING desde horarios recurrentes del equipo (próximas N semanas). */
export async function generateTeamSessionsFromSchedule(input: {
  teamId: string
  weeksAhead?: number
}) {
  const teamId = input.teamId.trim()
  if (!teamId) return { created: 0 }

  const weeks = Math.min(12, Math.max(1, input.weeksAhead ?? 4))
  const schedules = await prisma.teamSchedule.findMany({ where: { teamId } })
  if (schedules.length === 0) return { created: 0 }

  const holidays = await prisma.clubHoliday.findMany()
  const holidayDates = holidays.map((h) => h.date)

  const now = new Date()
  const end = new Date(now)
  end.setDate(end.getDate() + weeks * 7)

  let created = 0
  for (let d = new Date(now); d <= end; d.setDate(d.getDate() + 1)) {
    const day = new Date(d)
    if (isHoliday(day, holidayDates)) continue

    const weekday = day.getDay()
    const daySchedules = schedules.filter((s) => s.weekday === weekday)
    for (const sch of daySchedules) {
      const t = parseTime(sch.startTime)
      if (!t) continue

      const start = new Date(day)
      start.setHours(t.hours, t.minutes, 0, 0)
      if (start < now) continue

      const exists = await prisma.event.findFirst({
        where: {
          teamId,
          type: 'TRAINING',
          date: start,
          title: sch.title || `Entrenamiento ${sch.startTime}`,
        },
      })
      if (exists) continue

      const event = await prisma.event.create({
        data: {
          title: sch.title || `Entrenamiento ${sch.startTime}`,
          type: 'TRAINING',
          date: start,
          location: sch.location,
          teamId,
        },
      })

      const teamMembers = await prisma.teamMember.findMany({ where: { teamId } })
      if (teamMembers.length > 0) {
        await prisma.attendance.createMany({
          data: teamMembers.map((tm) => ({
            eventId: event.id,
            memberId: tm.memberId,
            status: 'PENDING',
          })),
          skipDuplicates: true,
        })
      }
      created++
    }
  }

  return { created }
}

/** Eventos que empiezan en los próximos `withinMinutes` minutos. */
export async function findEventsStartingSoon(withinMinutes = 60) {
  const now = new Date()
  const until = new Date(now.getTime() + withinMinutes * 60_000)
  return prisma.event.findMany({
    where: {
      status: 'SCHEDULED',
      date: { gte: now, lte: until },
    },
    include: { team: true },
  })
}

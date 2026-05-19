import { prisma } from '@/lib/prisma'

export type TeamSeasonRange = {
  start: Date
  end: Date
  usedFallbackEnd: boolean
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

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

function parseDateInput(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T12:00:00.000Z`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(trimmed)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Rango de generación según temporada del equipo (por grupo). */
export async function resolveTeamSeasonRange(teamId: string): Promise<TeamSeasonRange> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { seasonStartDate: true, seasonEndDate: true },
  })
  if (!team) {
    throw new Error('Equipo no encontrado')
  }

  const today = startOfDay(new Date())
  let start = team.seasonStartDate ? startOfDay(team.seasonStartDate) : today
  if (start < today) start = today

  let usedFallbackEnd = false
  let end = team.seasonEndDate ? startOfDay(team.seasonEndDate) : null
  if (!end) {
    end = new Date(today)
    end.setMonth(end.getMonth() + 6)
    usedFallbackEnd = true
    console.warn(
      `[team-calendar] Equipo ${teamId} sin seasonEndDate; usando fallback +6 meses hasta ${end.toISOString().slice(0, 10)}`,
    )
  }

  if (end < start) {
    throw new Error('La fecha de fin de temporada debe ser posterior al inicio')
  }

  end.setHours(23, 59, 59, 999)
  return { start, end, usedFallbackEnd }
}

export async function clearFutureScheduledTeamSessions(teamId: string) {
  const today = startOfDay(new Date())
  const deleted = await prisma.event.deleteMany({
    where: {
      teamId,
      type: 'TRAINING',
      source: 'TEAM_SCHEDULE',
      status: 'SCHEDULED',
      date: { gte: today },
    },
  })
  return deleted.count
}

export type GenerateTeamSessionsInput = {
  teamId: string
  weeksAhead?: number
  untilSeasonEnd?: boolean
  regenerate?: boolean
}

export type GenerateTeamSessionsResult = {
  created: number
  skipped: number
  deleted: number
  usedFallbackEnd: boolean
}

/** Genera eventos TRAINING desde horarios recurrentes hasta fin de temporada (o N semanas). */
export async function generateTeamSessionsFromSchedule(
  input: GenerateTeamSessionsInput,
): Promise<GenerateTeamSessionsResult> {
  const teamId = input.teamId.trim()
  if (!teamId) {
    return { created: 0, skipped: 0, deleted: 0, usedFallbackEnd: false }
  }

  const schedules = await prisma.teamSchedule.findMany({ where: { teamId } })
  if (schedules.length === 0) {
    return { created: 0, skipped: 0, deleted: 0, usedFallbackEnd: false }
  }

  let deleted = 0
  if (input.regenerate !== false) {
    deleted = await clearFutureScheduledTeamSessions(teamId)
  }

  const holidays = await prisma.clubHoliday.findMany()
  const holidayDates = holidays.map((h) => h.date)

  let rangeStart: Date
  let rangeEnd: Date
  let usedFallbackEnd = false

  if (input.untilSeasonEnd !== false) {
    const range = await resolveTeamSeasonRange(teamId)
    rangeStart = range.start
    rangeEnd = range.end
    usedFallbackEnd = range.usedFallbackEnd
  } else {
    const now = startOfDay(new Date())
    rangeStart = now
    rangeEnd = new Date(now)
    const weeks = Math.min(12, Math.max(1, input.weeksAhead ?? 4))
    rangeEnd.setDate(rangeEnd.getDate() + weeks * 7)
    rangeEnd.setHours(23, 59, 59, 999)
  }

  const teamMembers = await prisma.teamMember.findMany({ where: { teamId } })
  let created = 0
  let skipped = 0

  for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
    const day = new Date(d)
    if (isHoliday(day, holidayDates)) continue

    const weekday = day.getDay()
    const daySchedules = schedules.filter((s) => s.weekday === weekday)
    for (const sch of daySchedules) {
      const t = parseTime(sch.startTime)
      if (!t) continue

      const start = new Date(day)
      start.setHours(t.hours, t.minutes, 0, 0)
      if (start < new Date()) continue

      const title = sch.title || `Entrenamiento ${sch.startTime}`
      const exists = await prisma.event.findFirst({
        where: {
          teamId,
          type: 'TRAINING',
          date: start,
          OR: [{ source: 'TEAM_SCHEDULE' }, { source: 'MANUAL' }],
        },
      })
      if (exists) {
        skipped++
        continue
      }

      const endDate = new Date(start.getTime() + (sch.durationMinutes || 90) * 60_000)

      const event = await prisma.event.create({
        data: {
          title,
          type: 'TRAINING',
          date: start,
          endDate,
          location: sch.location,
          teamId,
          source: 'TEAM_SCHEDULE',
        },
      })

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

  return { created, skipped, deleted, usedFallbackEnd }
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

export { parseDateInput }

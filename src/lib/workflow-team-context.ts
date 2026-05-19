import { prisma } from '@/lib/prisma'

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** Rellena variables de plantilla para mensajes WD-1 (horarios, sede, entrenador). */
export async function populateTeamRosterVariables(
  teamId: string,
  variables: Record<string, string>,
) {
  const cleanId = teamId.trim()
  if (!cleanId) return

  const team = await prisma.team.findUnique({
    where: { id: cleanId },
    select: { name: true },
  })
  if (team?.name) {
    variables.assignedTeamName = team.name
    variables.teamAssignedName = team.name
  }

  const schedules = await prisma.teamSchedule.findMany({
    where: { teamId: cleanId },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
  })

  if (schedules.length > 0) {
    variables.teamScheduleSummary = schedules
      .map((s) => {
        const day = WEEKDAY_LABELS[s.weekday] ?? `D${s.weekday}`
        const loc = s.location?.trim() ? ` · ${s.location.trim()}` : ''
        return `${day} ${s.startTime}${loc}`
      })
      .join(' | ')
    const withLocation = schedules.find((s) => s.location?.trim())
    variables.teamTrainingLocation = withLocation?.location?.trim() || ''
  } else {
    const nextEvent = await prisma.event.findFirst({
      where: { teamId: cleanId, status: 'SCHEDULED', date: { gte: new Date() } },
      orderBy: { date: 'asc' },
      select: { date: true, location: true, title: true },
    })
    variables.teamScheduleSummary = nextEvent
      ? `Próxima sesión: ${nextEvent.title} (${nextEvent.date.toLocaleDateString('es-ES')})`
      : 'Consulta el calendario del club'
    variables.teamTrainingLocation = nextEvent?.location?.trim() || ''
  }

  const coachLink = await prisma.teamMember.findFirst({
    where: { teamId: cleanId, role: 'COACH' },
    include: {
      member: { select: { name: true, phone: true, email: true } },
    },
  })

  variables.coachName = coachLink?.member.name?.trim() || 'Entrenador/a del club'
  variables.coachPhone = coachLink?.member.phone?.trim() || ''
  variables.coachEmail = coachLink?.member.email?.trim() || ''
  variables.assignedTeamId = cleanId
  variables.teamAssignedId = cleanId
}

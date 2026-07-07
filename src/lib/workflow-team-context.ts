import { prisma } from '@/lib/prisma'

/** Rellena variables de plantilla para mensajes WD-1 (sede, entrenador). */
export async function populateTeamRosterVariables(
  groupId: string,
  variables: Record<string, string>,
) {
  const cleanId = groupId.trim()
  if (!cleanId) return

  const team = await prisma.group.findUnique({
    where: { id: cleanId },
    select: { name: true },
  })
  if (team?.name) {
    variables.assignedTeamName = team.name
    variables.teamAssignedName = team.name
  }

  const nextEvent = await prisma.event.findFirst({
    where: { groupId: cleanId, status: 'SCHEDULED', date: { gte: new Date() } },
    orderBy: { date: 'asc' },
    select: { date: true, location: true, title: true },
  })
  variables.teamScheduleSummary = nextEvent
    ? `Próxima sesión: ${nextEvent.title} (${nextEvent.date.toLocaleDateString('es-ES')})`
    : 'Consulta el calendario del club'
  variables.teamTrainingLocation = nextEvent?.location?.trim() || ''

  const coachLink = await prisma.groupMembership.findFirst({
    where: { groupId: cleanId, role: 'COACH' },
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

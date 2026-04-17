import { prisma } from '@/lib/prisma'

function calculateAge(birthDate: Date, now = new Date()) {
  let age = now.getFullYear() - birthDate.getFullYear()
  const monthDiff = now.getMonth() - birthDate.getMonth()
  const beforeBirthday = monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())
  if (beforeBirthday) age--
  return age
}

function readString(config: unknown, key: string): string | null {
  if (!config || typeof config !== 'object') return null
  const raw = (config as Record<string, unknown>)[key]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function readNumber(config: unknown, key: string): number | null {
  const value = readString(config, key)
  if (!value) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export async function runMemberCreatedWorkflows(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, birthDate: true },
  })

  if (!member) return

  const workflows = await prisma.workflow.findMany({
    where: { isActive: true, triggerType: 'MEMBER_CREATED' },
    include: { steps: { orderBy: { position: 'asc' } } },
  })

  for (const workflow of workflows) {
    for (const step of workflow.steps) {
      if (step.actionType !== 'ASSIGN_TEAM_BY_AGE') continue
      if (!member.birthDate) continue

      const maxAge = readNumber(step.config, 'maxAge')
      const minAge = readNumber(step.config, 'minAge')
      const teamId = readString(step.config, 'teamId')

      if (!teamId) continue

      const age = calculateAge(member.birthDate)
      if (minAge !== null && age < minAge) continue
      if (maxAge !== null && age > maxAge) continue

      await prisma.teamMember.upsert({
        where: {
          teamId_memberId: {
            teamId,
            memberId: member.id,
          },
        },
        update: {
          role: 'PLAYER',
        },
        create: {
          teamId,
          memberId: member.id,
          role: 'PLAYER',
        },
      })
    }
  }
}

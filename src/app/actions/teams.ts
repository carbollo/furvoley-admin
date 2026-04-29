'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function createTeam(data: { name: string; category?: string }) {
  const team = await prisma.team.create({ data })
  revalidatePath('/')
  return team
}

export async function deleteTeam(id: string) {
  await prisma.team.delete({ where: { id } })
  revalidatePath('/')
}

export async function addTeamMember(data: { teamId: string; memberId: string; role: string }) {
  const teamMember = await prisma.teamMember.create({ data })
  revalidatePath('/')
  return teamMember
}

export async function removeTeamMember(id: string) {
  await prisma.teamMember.delete({ where: { id } })
  revalidatePath('/')
}

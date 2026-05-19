'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { runTeamRosterConfirmedWorkflows } from '@/lib/workflow-engine'

export async function createTeam(data: { name: string; category?: string }) {
  const team = await prisma.team.create({ data })
  revalidatePath('/')
  return team
}

export async function updateTeam(
  id: string,
  data: { name?: string; category?: string | null },
) {
  await prisma.team.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
    },
  })
  revalidatePath('/')
}

/** Un solo entrenador por equipo; el resto pasan a jugador si hacían de coach. */
export async function setTeamCoach(teamId: string, memberId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.teamMember.updateMany({
      where: { teamId, role: 'COACH' },
      data: { role: 'PLAYER' },
    })
    await tx.teamMember.upsert({
      where: { teamId_memberId: { teamId, memberId } },
      create: { teamId, memberId, role: 'COACH' },
      update: { role: 'COACH' },
    })
  })
  revalidatePath('/')
}

export async function deleteTeam(id: string) {
  await prisma.team.delete({ where: { id } })
  revalidatePath('/')
}

export async function addTeamMember(data: { teamId: string; memberId: string; role: string }) {
  const role = data.role === 'COACH' ? 'COACH' : 'PLAYER'
  const teamMember = await prisma.$transaction(async (tx) => {
    if (role === 'PLAYER') {
      await tx.teamMember.deleteMany({
        where: {
          memberId: data.memberId,
          role: 'PLAYER',
          teamId: { not: data.teamId },
        },
      })
    }
    return tx.teamMember.upsert({
      where: {
        teamId_memberId: { teamId: data.teamId, memberId: data.memberId },
      },
      create: { teamId: data.teamId, memberId: data.memberId, role },
      update: { role },
    })
  })
  if (role === 'PLAYER') {
    await runTeamRosterConfirmedWorkflows(data.memberId, { rosterTeamId: data.teamId })
  }
  revalidatePath('/')
  return teamMember
}

export async function removeTeamMember(id: string) {
  await prisma.teamMember.delete({ where: { id } })
  revalidatePath('/')
}

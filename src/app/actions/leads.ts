'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { runLeadCreatedWorkflows, runLeadUpdatedWorkflows } from '@/lib/workflow-engine'

export async function createLead(data: {
  name: string
  email?: string
  phone?: string
  sportPreference?: string
  notes?: string
}) {
  const name = data.name.trim()
  if (!name) throw new Error('El nombre es obligatorio')

  const lead = await prisma.lead.create({
    data: {
      name,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      sportPreference: data.sportPreference?.trim() || null,
      notes: data.notes?.trim() || null,
      status: 'NEW',
    },
  })

  await runLeadCreatedWorkflows(lead.id)
  revalidatePath('/')
  return lead
}

export async function updateLead(
  id: string,
  data: {
    name?: string
    email?: string
    phone?: string
    sportPreference?: string
    status?: string
    notes?: string
    memberId?: string | null
  },
) {
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.email !== undefined ? { email: data.email?.trim() || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      ...(data.sportPreference !== undefined
        ? { sportPreference: data.sportPreference?.trim() || null }
        : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      ...(data.memberId !== undefined ? { memberId: data.memberId } : {}),
    },
  })

  await runLeadUpdatedWorkflows(lead.id)
  revalidatePath('/')
  return lead
}

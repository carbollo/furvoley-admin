'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

type WorkflowStepInput = {
  position: number
  stepType: string
  actionType: string
  config?: Record<string, string> | null
}

export async function createWorkflow(input: {
  name: string
  description?: string
  triggerType: string
  triggerConfig?: Record<string, string> | null
  isActive?: boolean
  steps: WorkflowStepInput[]
}) {
  if (!input.name.trim()) {
    throw new Error('El nombre del workflow es obligatorio')
  }

  if (!input.steps.length) {
    throw new Error('Debes añadir al menos un paso al workflow')
  }

  await prisma.workflow.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      triggerType: input.triggerType,
      triggerConfig: input.triggerConfig || null,
      isActive: input.isActive ?? true,
      steps: {
        create: input.steps.map((step) => ({
          position: step.position,
          stepType: step.stepType,
          actionType: step.actionType,
          config: step.config || null,
        })),
      },
    },
  })

  revalidatePath('/workflows')
}

export async function setWorkflowActive(id: string, isActive: boolean) {
  await prisma.workflow.update({
    where: { id },
    data: { isActive },
  })

  revalidatePath('/workflows')
}

export async function deleteWorkflow(id: string) {
  await prisma.workflow.delete({
    where: { id },
  })

  revalidatePath('/workflows')
}

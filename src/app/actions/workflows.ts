'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

export async function setWorkflowActive(id: string, isActive: boolean) {
  await prisma.workflow.update({
    where: { id },
    data: { isActive },
  })

  revalidatePath('/')
}

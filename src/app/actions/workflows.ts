// Módulo de SERVIDOR (sin 'use server'): setWorkflowActive NO es un server action
// RPC. Solo lo llama la ruta /api/crm/workflows/[id]/toggle (requireRoles + gate de
// módulo). Antes con 'use server' era invocable por RPC sin auth.
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

export async function setWorkflowActive(id: string, isActive: boolean) {
  await prisma.workflow.update({
    where: { id },
    data: { isActive },
  })

  revalidatePath('/')
}

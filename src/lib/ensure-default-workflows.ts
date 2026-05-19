import { prisma } from '@/lib/prisma'
import { WD1_CATALOG_ID, WD1_WORKFLOW } from '@/lib/default-workflows/wd-1'

function hasCatalogId(triggerConfig: unknown, catalogId: string): boolean {
  if (!triggerConfig || typeof triggerConfig !== 'object') return false
  return (triggerConfig as { catalogId?: string }).catalogId === catalogId
}

async function workflowExists(catalogId: string): Promise<boolean> {
  const rows = await prisma.workflow.findMany({
    select: { id: true, description: true, triggerConfig: true },
  })
  return rows.some(
    (w) =>
      hasCatalogId(w.triggerConfig, catalogId) ||
      (w.description || '').includes(`[${catalogId}]`),
  )
}

async function ensureWd1(): Promise<{ created: boolean; id?: string }> {
  if (await workflowExists(WD1_CATALOG_ID)) {
    return { created: false }
  }

  const wf = await prisma.workflow.create({
    data: {
      name: WD1_WORKFLOW.name,
      description: WD1_WORKFLOW.description,
      triggerType: WD1_WORKFLOW.triggerType,
      triggerConfig: WD1_WORKFLOW.triggerConfig as object,
      isActive: WD1_WORKFLOW.isActive,
    },
  })

  await prisma.workflowStep.createMany({
    data: WD1_WORKFLOW.steps.map((s) => ({
      workflowId: wf.id,
      position: s.position,
      stepType: s.stepType,
      actionType: s.actionType,
      config: s.config as object,
    })),
  })

  return { created: true, id: wf.id }
}

export async function ensureDefaultWorkflows(): Promise<{
  wd1: { created: boolean; id?: string }
}> {
  const wd1 = await ensureWd1()
  return { wd1 }
}

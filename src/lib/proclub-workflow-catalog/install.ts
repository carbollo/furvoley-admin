import { prisma } from '@/lib/prisma'
import type { ImportableWorkflow } from '@/lib/workflow-import'
import { PROCLUB_CATALOG } from '@/lib/proclub-workflow-catalog'

function catalogIdFromConfig(triggerConfig: unknown): string | null {
  if (!triggerConfig || typeof triggerConfig !== 'object') return null
  const id = (triggerConfig as { catalogId?: string }).catalogId
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

async function findWorkflowByCatalogId(catalogId: string) {
  const rows = await prisma.workflow.findMany({
    select: { id: true, triggerConfig: true, description: true },
  })
  return (
    rows.find((w) => catalogIdFromConfig(w.triggerConfig) === catalogId) ||
    rows.find((w) => (w.description || '').includes(`[${catalogId}]`)) ||
    null
  )
}

async function upsertWorkflow(wf: ImportableWorkflow): Promise<{ id: string; created: boolean }> {
  const catalogId = catalogIdFromConfig(wf.triggerConfig)
  const existing = catalogId ? await findWorkflowByCatalogId(catalogId) : null

  if (existing) {
    await prisma.workflowStep.deleteMany({ where: { workflowId: existing.id } })
    await prisma.workflow.update({
      where: { id: existing.id },
      data: {
        name: wf.name,
        description: wf.description,
        triggerType: wf.triggerType,
        triggerConfig: (wf.triggerConfig ?? undefined) as object | undefined,
        // `isActive` NO se toca al reinstalar. Encender o apagar un flujo es
        // decisión del club: un admin que había apagado el aviso que bombardeaba
        // a los tutores se lo encontraba encendido otra vez por pulsar
        // «instalar», y los mensajes volvían a salir sin que nadie lo pidiera.
        // Lo demás sí se actualiza, para que las correcciones del catálogo
        // lleguen a quien ya lo instaló.
      },
    })
    await prisma.workflowStep.createMany({
      data: wf.steps.map((s) => ({
        workflowId: existing.id,
        position: s.position,
        stepType: s.stepType,
        actionType: s.actionType,
        config: s.config as object,
      })),
    })
    return { id: existing.id, created: false }
  }

  const row = await prisma.workflow.create({
    data: {
      name: wf.name,
      description: wf.description,
      triggerType: wf.triggerType,
      triggerConfig: (wf.triggerConfig ?? undefined) as object | undefined,
      isActive: wf.isActive,
    },
  })
  await prisma.workflowStep.createMany({
    data: wf.steps.map((s) => ({
      workflowId: row.id,
      position: s.position,
      stepType: s.stepType,
      actionType: s.actionType,
      config: s.config as object,
    })),
  })
  return { id: row.id, created: true }
}

export async function installProclubWorkflows(options: {
  catalogIds?: string[]
  installAll?: boolean
}): Promise<{ installed: number; updated: number; skipped: number; ids: string[] }> {
  const targets = options.installAll
    ? PROCLUB_CATALOG
    : PROCLUB_CATALOG.filter((e) => options.catalogIds?.includes(e.catalogId))

  let installed = 0
  let updated = 0
  let skipped = 0
  const ids: string[] = []

  for (const entry of targets) {
    if (entry.automation === 'manual') {
      skipped++
      continue
    }
    try {
      const result = await upsertWorkflow(entry.workflow)
      ids.push(entry.catalogId)
      if (result.created) installed++
      else updated++
    } catch (e) {
      console.warn(`[proclub] install ${entry.catalogId} failed:`, e)
      skipped++
    }
  }

  return { installed, updated, skipped, ids }
}

export async function seedProclubTemplates(): Promise<{ created: number; skipped: number }> {
  let created = 0
  let skipped = 0

  for (const entry of PROCLUB_CATALOG) {
    if (entry.automation === 'manual') {
      skipped++
      continue
    }
    const exists = await prisma.workflowTemplate.findFirst({
      where: { name: entry.workflow.name },
      select: { id: true },
    })
    if (exists) {
      skipped++
      continue
    }
    await prisma.workflowTemplate.create({
      data: {
        name: entry.workflow.name,
        description: entry.workflow.description,
        triggerType: entry.workflow.triggerType,
        triggerConfig: (entry.workflow.triggerConfig ?? undefined) as object | undefined,
        steps: entry.workflow.steps as object,
      },
    })
    created++
  }

  return { created, skipped }
}

export async function listProclubCatalogStatus(): Promise<
  Array<{
    catalogId: string
    name: string
    area: string
    automation: string
    phase: number
    triggerType: string
    stepCount: number
    installed: boolean
    workflowId: string | null
  }>
> {
  const rows = await prisma.workflow.findMany({
    select: { id: true, triggerConfig: true, description: true, isActive: true },
  })

  return PROCLUB_CATALOG.map((entry) => {
    const match =
      rows.find((w) => catalogIdFromConfig(w.triggerConfig) === entry.catalogId) ||
      rows.find((w) => (w.description || '').includes(`[${entry.catalogId}]`))
    return {
      catalogId: entry.catalogId,
      name: entry.workflow.name,
      area: entry.area,
      automation: entry.automation,
      phase: entry.phase,
      triggerType: entry.workflow.triggerType,
      stepCount: entry.workflow.steps.length,
      installed: !!match,
      workflowId: match?.id ?? null,
    }
  })
}

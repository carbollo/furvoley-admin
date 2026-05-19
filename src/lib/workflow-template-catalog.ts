import { prisma } from '@/lib/prisma'
import type { ImportableWorkflow } from '@/lib/workflow-import'

export type WorkflowTemplateDto = {
  id: string
  name: string
  description: string | null
  triggerType: string
  stepCount: number
  createdAt: string
}

export function serializeWorkflowTemplate(row: {
  id: string
  name: string
  description: string | null
  triggerType: string
  steps: unknown
  createdAt: Date
}): WorkflowTemplateDto {
  const steps = Array.isArray(row.steps) ? row.steps : []
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    triggerType: row.triggerType,
    stepCount: steps.length,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listWorkflowTemplates(): Promise<WorkflowTemplateDto[]> {
  const rows = await prisma.workflowTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map(serializeWorkflowTemplate)
}

export async function createWorkflowTemplatesFromImport(
  workflows: ImportableWorkflow[],
): Promise<{ created: WorkflowTemplateDto[] }> {
  const created: WorkflowTemplateDto[] = []
  for (const wf of workflows) {
    const row = await prisma.workflowTemplate.create({
      data: {
        name: wf.name,
        description: wf.description,
        triggerType: wf.triggerType,
        triggerConfig: (wf.triggerConfig ?? undefined) as object | undefined,
        steps: wf.steps as object,
      },
    })
    created.push(serializeWorkflowTemplate(row))
  }
  return { created }
}

export async function installWorkflowTemplate(templateId: string): Promise<
  | { ok: true; workflowId: string }
  | { ok: false; reason: string }
> {
  const template = await prisma.workflowTemplate.findUnique({ where: { id: templateId } })
  if (!template) {
    return { ok: false, reason: 'Plantilla no encontrada' }
  }

  const steps = Array.isArray(template.steps)
    ? (template.steps as ImportableWorkflow['steps'])
    : []

  const wf = await prisma.workflow.create({
    data: {
      name: template.name,
      description: template.description,
      triggerType: template.triggerType,
      triggerConfig: template.triggerConfig ?? undefined,
      isActive: true,
    },
  })

  if (steps.length > 0) {
    await prisma.workflowStep.createMany({
      data: steps.map((s, i) => ({
        workflowId: wf.id,
        position: typeof s.position === 'number' ? s.position : i,
        stepType: s.stepType || 'ACTION',
        actionType: s.actionType,
        config: (s.config || {}) as object,
      })),
    })
  }

  return { ok: true, workflowId: wf.id }
}

export async function snapshotWorkflowToTemplate(workflowId: string): Promise<
  | { ok: true; template: WorkflowTemplateDto }
  | { ok: false; reason: string }
> {
  const wf = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: { steps: { orderBy: { position: 'asc' } } },
  })
  if (!wf) {
    return { ok: false, reason: 'Flujo no encontrado' }
  }

  const steps = wf.steps.map((s) => ({
    position: s.position,
    stepType: s.stepType,
    actionType: s.actionType,
    config:
      s.config && typeof s.config === 'object' && !Array.isArray(s.config)
        ? (s.config as Record<string, unknown>)
        : {},
  }))

  const row = await prisma.workflowTemplate.create({
    data: {
      name: wf.name,
      description: wf.description,
      triggerType: wf.triggerType,
      triggerConfig: (wf.triggerConfig ?? undefined) as object | undefined,
      steps: steps as object,
    },
  })

  return { ok: true, template: serializeWorkflowTemplate(row) }
}

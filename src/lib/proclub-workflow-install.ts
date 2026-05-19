import { prisma } from '@/lib/prisma'
import { isWorkflowActionAllowed } from '@/lib/crm-workflow-actions'
import { isWorkflowTriggerAllowed } from '@/lib/crm-workflow-triggers'
import {
  getProclubTemplate,
  proclubIdFromDescription,
  proclubIdFromTriggerConfig,
} from '@/lib/proclub-workflow-catalog'

export type InstallProclubTemplateResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  workflowId?: string
  name?: string
}

async function findInstalledProclubIds(): Promise<Set<string>> {
  const rows = await prisma.workflow.findMany({
    select: { triggerConfig: true, description: true },
  })
  const ids = new Set<string>()
  for (const row of rows) {
    const fromCfg = proclubIdFromTriggerConfig(row.triggerConfig)
    if (fromCfg) ids.add(fromCfg)
    const fromDesc = proclubIdFromDescription(row.description)
    if (fromDesc) ids.add(fromDesc)
  }
  return ids
}

function filterInstallableSteps(
  steps: { position: number; stepType: string; actionType: string; config: Record<string, unknown> }[],
) {
  return steps.filter((s) => isWorkflowActionAllowed(s.actionType))
}

export async function installProclubTemplate(input: {
  proclubId: string
  allowDuplicate?: boolean
  forceActive?: boolean
}): Promise<InstallProclubTemplateResult> {
  const template = getProclubTemplate(input.proclubId)
  if (!template) {
    return { ok: false, reason: 'Plantilla PROCLUB no encontrada' }
  }

  if (!isWorkflowTriggerAllowed(template.triggerType)) {
    return { ok: false, reason: `Disparador no permitido: ${template.triggerType}` }
  }

  const installed = await findInstalledProclubIds()
  let name = template.name
  if (installed.has(template.proclubId) && !input.allowDuplicate) {
    return {
      ok: true,
      skipped: true,
      reason: `Ya existe un flujo con ${template.proclubId}. Usa allowDuplicate para instalar copia.`,
    }
  }
  if (installed.has(template.proclubId) && input.allowDuplicate) {
    name = `${template.name} (copia)`
  }

  const steps = filterInstallableSteps(template.steps)
  const isActive = input.forceActive ?? template.defaultActive

  const wf = await prisma.workflow.create({
    data: {
      name,
      description: template.description,
      triggerType: template.triggerType,
      isActive,
      triggerConfig: {
        proclubId: template.proclubId,
        proclubArea: template.proclubArea,
        proclubType: template.proclubType,
        implementationStatus: template.implementationStatus,
        phase: template.phase,
        ...(template.onlyWhenCurrentStatus
          ? { onlyWhenCurrentStatus: template.onlyWhenCurrentStatus }
          : {}),
        ...(template.eventKinds?.length ? { eventKinds: template.eventKinds } : {}),
      },
    },
  })

  if (steps.length > 0) {
    await prisma.workflowStep.createMany({
      data: steps.map((s, i) => ({
        workflowId: wf.id,
        position: s.position ?? i,
        stepType: s.stepType,
        actionType: s.actionType,
        config: s.config as object,
      })),
    })
  }

  return { ok: true, workflowId: wf.id, name: wf.name }
}

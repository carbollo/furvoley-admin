import type { ImportableWorkflow } from '@/lib/workflow-import'

export type ProclubArea = 'sport' | 'billing' | 'leads' | 'enrollment' | 'leave'
export type ProclubAutomation = 'auto' | 'mixed' | 'manual'

export type ProclubCatalogEntry = {
  catalogId: string
  area: ProclubArea
  automation: ProclubAutomation
  phase: number
  workflow: ImportableWorkflow
}

export function defineProclubWorkflow(
  catalogId: string,
  meta: {
    area: ProclubArea
    automation: ProclubAutomation
    phase: number
    name: string
    description: string
    triggerType: string
    triggerConfig?: Record<string, unknown>
    isActive?: boolean
    steps: ImportableWorkflow['steps']
  },
): ProclubCatalogEntry {
  return {
    catalogId,
    area: meta.area,
    automation: meta.automation,
    phase: meta.phase,
    workflow: {
      name: meta.name,
      description: `[${catalogId}] ${meta.description}`,
      triggerType: meta.triggerType,
      triggerConfig: { catalogId, ...meta.triggerConfig },
      isActive: meta.isActive !== false,
      steps: meta.steps,
    },
  }
}

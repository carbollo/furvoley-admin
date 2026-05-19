import { isWorkflowActionAllowed } from '@/lib/crm-workflow-actions'
import { isWorkflowTriggerAllowed } from '@/lib/crm-workflow-triggers'

export type ImportableWorkflow = {
  name: string
  description: string | null
  triggerType: string
  triggerConfig?: Record<string, unknown> | null
  isActive: boolean
  steps: Array<{
    position: number
    stepType: string
    actionType: string
    config: Record<string, unknown>
  }>
}

function normalizeWorkflowItem(item: unknown): ImportableWorkflow | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const triggerType = String(o.triggerType || 'MEMBER_CREATED').trim()
  if (!isWorkflowTriggerAllowed(triggerType)) return null

  const stepsRaw = Array.isArray(o.steps) ? (o.steps as Record<string, unknown>[]) : []
  const steps = stepsRaw
    .map((s, i) => {
      const actionType = String(s.actionType || '').trim()
      if (!isWorkflowActionAllowed(actionType)) return null
      return {
        position: typeof s.position === 'number' ? s.position : i,
        stepType: String(s.stepType || 'ACTION').trim() || 'ACTION',
        actionType,
        config:
          s.config && typeof s.config === 'object' && !Array.isArray(s.config)
            ? (s.config as Record<string, unknown>)
            : {},
      }
    })
    .filter((x): x is ImportableWorkflow['steps'][number] => !!x)

  const name = String(o.name || '').trim()
  if (!name) return null

  let triggerConfig: Record<string, unknown> | null = null
  if (o.triggerConfig && typeof o.triggerConfig === 'object' && !Array.isArray(o.triggerConfig)) {
    triggerConfig = o.triggerConfig as Record<string, unknown>
  }

  return {
    name,
    description: String(o.description || '').trim() || null,
    triggerType,
    triggerConfig,
    isActive: o.isActive !== false,
    steps,
  }
}

/** Acepta export furvoley-workflows, array o un solo flujo. */
export function parseWorkflowsFromJson(input: unknown): ImportableWorkflow[] {
  if (Array.isArray(input)) {
    return input.map(normalizeWorkflowItem).filter((x): x is ImportableWorkflow => !!x)
  }
  if (!input || typeof input !== 'object') return []
  const o = input as Record<string, unknown>
  if (Array.isArray(o.workflows)) {
    return (o.workflows as unknown[])
      .map(normalizeWorkflowItem)
      .filter((x): x is ImportableWorkflow => !!x)
  }
  const single = normalizeWorkflowItem(input)
  return single ? [single] : []
}

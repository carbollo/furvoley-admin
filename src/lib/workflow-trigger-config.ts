/** Extrae `triggerConfig` persistido en BD desde la config del nodo disparador del editor. */

export type WorkflowTriggerConfig = {
  onlyWhenCurrentStatus?: string
  onlyWhenPreviousStatus?: string
  eventKinds?: string[]
  catalogId?: string
  [key: string]: unknown
}

export function triggerConfigFromNodeConfig(
  cfg: Record<string, unknown> | null | undefined,
): WorkflowTriggerConfig | null {
  if (!cfg || typeof cfg !== 'object') return null
  const out: WorkflowTriggerConfig = {}
  const cur = String(cfg.onlyWhenCurrentStatus ?? '').trim()
  const prev = String(cfg.onlyWhenPreviousStatus ?? '').trim()
  if (cur) out.onlyWhenCurrentStatus = cur
  if (prev) out.onlyWhenPreviousStatus = prev
  if (Array.isArray(cfg.eventKinds) && cfg.eventKinds.length > 0) {
    out.eventKinds = cfg.eventKinds.map((x) => String(x))
  }
  return Object.keys(out).length > 0 ? out : null
}

export function mergeTriggerNodeConfig(
  triggerType: string,
  triggerConfig?: WorkflowTriggerConfig | null,
): Record<string, unknown> {
  const cfg: Record<string, unknown> = { triggerType }
  if (!triggerConfig) return cfg
  if (triggerConfig.onlyWhenCurrentStatus) {
    cfg.onlyWhenCurrentStatus = triggerConfig.onlyWhenCurrentStatus
  }
  if (triggerConfig.onlyWhenPreviousStatus) {
    cfg.onlyWhenPreviousStatus = triggerConfig.onlyWhenPreviousStatus
  }
  if (Array.isArray(triggerConfig.eventKinds) && triggerConfig.eventKinds.length > 0) {
    cfg.eventKinds = triggerConfig.eventKinds
  }
  return cfg
}

export function memberStatusChangeMatches(
  triggerConfig: unknown,
  context: { previousStatus?: string | null; currentStatus?: string | null },
  memberStatus: string,
): boolean {
  const cfg =
    triggerConfig && typeof triggerConfig === 'object'
      ? (triggerConfig as WorkflowTriggerConfig)
      : {}
  const requiredCurrent = cfg.onlyWhenCurrentStatus?.trim()
  const requiredPrevious = cfg.onlyWhenPreviousStatus?.trim()
  const current = String(context.currentStatus ?? memberStatus ?? '')
  const previous = String(context.previousStatus ?? '')
  if (requiredCurrent && current !== requiredCurrent) return false
  if (requiredPrevious && previous !== requiredPrevious) return false
  return true
}

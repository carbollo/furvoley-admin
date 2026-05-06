/** Tipos de disparador persistidos en `Workflow.triggerType`. El motor solo ejecuta hoy los de `MEMBER_CREATED`. */

export const WORKFLOW_TRIGGER_OPTIONS = [
  { value: 'MEMBER_CREATED', label: 'Alta de socio' },
  { value: 'MEMBER_UPDATED', label: 'Cambio de datos del socio' },
  { value: 'MEMBER_STATUS_CHANGED', label: 'Cambio de estado del socio' },
  { value: 'PAYMENT_CREATED', label: 'Cobro creado' },
  { value: 'PAYMENT_PAID', label: 'Cobro marcado como pagado' },
] as const

export const ALLOWED_WORKFLOW_TRIGGER_TYPES = new Set<string>(
  WORKFLOW_TRIGGER_OPTIONS.map((o) => o.value),
)

export function isWorkflowTriggerAllowed(t: string): boolean {
  return ALLOWED_WORKFLOW_TRIGGER_TYPES.has(t)
}

export function workflowTriggerLabel(triggerType: string): string {
  const o = WORKFLOW_TRIGGER_OPTIONS.find((x) => x.value === triggerType)
  return o?.label ?? triggerType
}

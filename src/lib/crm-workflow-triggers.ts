/** Tipos de disparador persistidos en `Workflow.triggerType`. El motor ejecuta los flujos activos cuyo trigger coincida con el evento. */

export const WORKFLOW_TRIGGER_OPTIONS = [
  { value: 'MEMBER_CREATED', label: 'Alta de socio / inscripción cerrada' },
  {
    value: 'TEAM_ROSTER_CONFIRMED',
    label: 'Plantilla de grupo confirmada (alta o cambio de grupo)',
  },
  { value: 'LEAD_CREATED', label: 'Lead captado (aún no es socio)' },
  { value: 'MEMBER_UPDATED', label: 'Cambio de datos del socio' },
  { value: 'MEMBER_STATUS_CHANGED', label: 'Cambio de estado del socio' },
  { value: 'PAYMENT_CREATED', label: 'Cobro creado (legacy)' },
  { value: 'PAYMENT_PAID', label: 'Cobro marcado como pagado (legacy)' },
  { value: 'INVOICE_CREATED', label: 'Factura creada' },
  { value: 'INVOICE_PAID', label: 'Factura pagada' },
  { value: 'INVOICE_OVERDUE', label: 'Factura vencida / impago' },
  { value: 'SUBSCRIPTION_CREATED', label: 'Suscripción creada' },
  { value: 'LEAD_UPDATED', label: 'Lead actualizado' },
  { value: 'EVENT_CANCELLED', label: 'Evento cancelado' },
  { value: 'EVENT_RESCHEDULED', label: 'Evento reprogramado' },
  { value: 'EVENT_STARTING_SOON', label: 'Evento próximo' },
  { value: 'EVENT_COMPLETED', label: 'Evento completado' },
  { value: 'ATTENDANCE_ABSENT_UNEXCUSED', label: 'Ausencia sin justificar' },
  { value: 'DOCUMENT_EXPIRING', label: 'Documentación por vencer' },
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

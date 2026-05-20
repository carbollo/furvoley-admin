/** Tipos de disparador persistidos en `Workflow.triggerType`. El motor ejecuta los flujos activos cuyo trigger coincida con el evento. */

export const WORKFLOW_TRIGGER_OPTIONS = [
  { value: 'MEMBER_CREATED', label: 'Alta de socio / inscripción cerrada' },
  {
    value: 'TEAM_ROSTER_CONFIRMED',
    label: 'Plantilla de grupo confirmada (alta o cambio de grupo)',
  },
  {
    value: 'TEAM_SCHEDULE_CHANGED',
    label: 'Horarios fijos del grupo modificados',
  },
  { value: 'LEAD_CREATED', label: 'Lead captado (aún no es socio)' },
  { value: 'LEAD_UPDATED', label: 'Lead actualizado' },
  { value: 'LEAD_COLD_FOLLOWUP', label: 'Seguimiento lead frío' },
  { value: 'TRIAL_REMINDER_DUE', label: 'Recordatorio prueba (5h antes)' },
  { value: 'WAITLIST_SLOT_AVAILABLE', label: 'Hueco en lista de espera' },
  { value: 'MEMBER_UPDATED', label: 'Cambio de datos del socio' },
  { value: 'MEMBER_STATUS_CHANGED', label: 'Cambio de estado del socio' },
  { value: 'MEMBER_LEAVE_REQUESTED', label: 'Solicitud de baja' },
  { value: 'MEMBER_RETURN_CAMPAIGN', label: 'Campaña retorno ex-socio' },
  { value: 'PAYMENT_CREATED', label: 'Cobro creado (legacy)' },
  { value: 'PAYMENT_PAID', label: 'Cobro marcado como pagado (legacy)' },
  { value: 'PAYMENT_FAILED', label: 'Pago fallido' },
  { value: 'INVOICE_CREATED', label: 'Factura creada' },
  { value: 'INVOICE_PAID', label: 'Factura pagada' },
  { value: 'INVOICE_OVERDUE', label: 'Factura vencida / impago' },
  { value: 'INVOICE_OVERDUE_ESCALATED', label: 'Impago escalado' },
  { value: 'SUBSCRIPTION_CREATED', label: 'Suscripción creada' },
  { value: 'SUBSCRIPTION_PAUSED', label: 'Suscripción en pausa' },
  { value: 'BILLING_CYCLE_DUE', label: 'Ciclo de facturación mensual' },
  { value: 'EXTRA_CHARGE_CREATED', label: 'Cobro extra creado' },
  { value: 'PAYMENT_METHOD_EXPIRING', label: 'Método de pago caducando' },
  { value: 'OVERDUE_REPORT_DUE', label: 'Informe semanal de impagos' },
  { value: 'MEMBER_CREDIT_APPLIED', label: 'Saldo a favor aplicado' },
  { value: 'SEASON_RENEWAL_DUE', label: 'Renovación de temporada' },
  { value: 'ACCOUNTING_EXPORT_DUE', label: 'Export contable programado' },
  { value: 'EVENT_CANCELLED', label: 'Evento cancelado' },
  { value: 'EVENT_RESCHEDULED', label: 'Evento reprogramado' },
  { value: 'EVENT_STARTING_SOON', label: 'Evento próximo' },
  { value: 'EVENT_COMPLETED', label: 'Evento completado' },
  { value: 'ATTENDANCE_ABSENT_UNEXCUSED', label: 'Ausencia sin justificar' },
  { value: 'DOCUMENT_EXPIRING', label: 'Documentación por vencer' },
  { value: 'CONVOCATION_PUBLISHED', label: 'Convocatoria publicada' },
  { value: 'COACH_ASSIGNED', label: 'Entrenador asignado a grupo' },
  { value: 'COACH_SUBSTITUTION_ASSIGNED', label: 'Sustitución de entrenador' },
  { value: 'TEAM_CHANGE_APPROVED', label: 'Cambio de grupo aprobado' },
  { value: 'EVALUATION_PUBLISHED', label: 'Evaluación publicada' },
  { value: 'BULK_MESSAGE_REQUESTED', label: 'Comunicación masiva solicitada' },
  { value: 'INCIDENT_RESOLVED', label: 'Incidencia resuelta' },
  { value: 'CONSENT_PENDING', label: 'Firmas pendientes' },
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

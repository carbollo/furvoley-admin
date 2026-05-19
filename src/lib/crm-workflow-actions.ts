export const WORKFLOW_ACTION_OPTIONS = [
  { value: 'ASSIGN_TEAM', label: 'Asignar a un equipo' },
  { value: 'ASSIGN_TEAM_BY_AGE', label: 'Asignar por rango de edad' },
  { value: 'ASSIGN_TEAM_BY_PREFERENCE', label: 'Asignar por preferencia deportiva' },
  { value: 'REMOVE_FROM_TEAM', label: 'Quitar de equipo' },
  { value: 'SET_MEMBER_STATUS', label: 'Cambiar estado del socio' },
  { value: 'SET_MEMBER_SPORT_PREFERENCE', label: 'Cambiar preferencia deportiva' },
  { value: 'SET_MEMBER_CONTACT', label: 'Actualizar contacto del socio' },
  { value: 'SET_MEMBER_DNI', label: 'Actualizar DNI del socio' },
  { value: 'SET_MEMBER_BIRTHDATE', label: 'Actualizar fecha nacimiento' },
  { value: 'CREATE_PAYMENT', label: 'Registrar cobro (cuota legacy)' },
  { value: 'CREATE_INVITE_SIGNUP_LINK', label: 'Enlace de inscripción (invitación, sin socio)' },
  { value: 'CREATE_SIGNUP_LINK', label: 'Enlace inscripción (socio ya dado de alta — evitar)' },
  { value: 'CREATE_TRANSACTION', label: 'Crear movimiento contable' },
  { value: 'SEND_WHATSAPP', label: 'Enviar WhatsApp' },
  { value: 'SEND_WHATSAPP_TO_TEAM', label: 'WhatsApp al equipo' },
  { value: 'SEND_PAYMENT_LINK', label: 'Enviar enlace de pago (Stripe)' },
  { value: 'SEND_INVOICE_PDF_WHATSAPP', label: 'Factura PDF por WhatsApp' },
  { value: 'CREATE_SUBSCRIPTION', label: 'Crear suscripción' },
  { value: 'CREATE_INVOICE_FROM_PLAN', label: 'Generar factura desde plan' },
  { value: 'GENERATE_TEAM_SESSIONS', label: 'Generar sesiones del grupo' },
  { value: 'HTTP_REQUEST', label: 'Petición HTTP' },
  { value: 'BRANCH_IF', label: 'Condición (ramificar)' },
] as const

export const ALLOWED_WORKFLOW_ACTIONS = new Set<string>(
  WORKFLOW_ACTION_OPTIONS.map((o) => o.value),
)

export function isWorkflowActionAllowed(actionType: string): boolean {
  return ALLOWED_WORKFLOW_ACTIONS.has(actionType)
}

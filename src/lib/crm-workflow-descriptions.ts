/** Textos cortos para el editor de flujos (nodos y panel lateral). */

const TRIGGER_DESCRIPTIONS: Record<string, string> = {
  MEMBER_CREATED:
    'Se dispara cuando un lead pasa a socio o se completa una inscripción. Ejecuta los flujos activos con este disparador (o eventKinds que lo incluyan).',
  TEAM_ROSTER_CONFIRMED:
    'Cuando el socio queda en la plantilla de un grupo (alta o cambio de equipo). Rellena variables de equipo y plantilla en el flujo.',
  TEAM_SCHEDULE_CHANGED:
    'Al guardar o borrar horarios fijos de un grupo. Útil para regenerar calendario o avisar cambios de entrenamiento.',
  LEAD_CREATED: 'Al crear un lead en el CRM (aún no es socio). Sirve para bienvenida o enlace de inscripción.',
  LEAD_UPDATED: 'Cuando se editan datos de un lead existente.',
  LEAD_COLD_FOLLOWUP: 'Seguimiento automático de leads sin respuesta (cron o regla de frío).',
  TRIAL_REMINDER_DUE: 'Recordatorio unas horas antes de una sesión de prueba reservada.',
  WAITLIST_SLOT_AVAILABLE: 'Cuando hay plaza libre y un socio en lista de espera puede entrar.',
  MEMBER_UPDATED: 'Cualquier cambio de ficha del socio (contacto, preferencias, etc.).',
  MEMBER_STATUS_CHANGED:
    'Al cambiar el estado del socio. Configura «pasa a» (activo, baja, pausa…) y opcionalmente «venía de».',
  MEMBER_LEAVE_REQUESTED: 'El socio solicita la baja o se inicia el proceso de salida.',
  MEMBER_RETURN_CAMPAIGN: 'Campaña de reactivación para ex-socios.',
  PAYMENT_CREATED: 'Legacy: se crea un cobro manual en contabilidad.',
  PAYMENT_PAID: 'Legacy: un cobro pasa a estado pagado.',
  PAYMENT_FAILED: 'Un cobro o cargo Stripe falla.',
  INVOICE_CREATED: 'Se genera una factura para el socio.',
  INVOICE_PAID: 'La factura queda pagada (webhook o marcado manual).',
  INVOICE_OVERDUE: 'Factura vencida sin pago en plazo.',
  INVOICE_OVERDUE_ESCALATED: 'Impago en fase escalada (segundo aviso o bloqueo).',
  SUBSCRIPTION_CREATED: 'Nueva suscripción Stripe vinculada al socio.',
  SUBSCRIPTION_PAUSED: 'La suscripción entra en pausa.',
  BILLING_CYCLE_DUE: 'Inicio de ciclo mensual (job /api/jobs/billing-cycle).',
  EXTRA_CHARGE_CREATED: 'Se registra un cobro extra puntual.',
  PAYMENT_METHOD_EXPIRING: 'Tarjeta o método de pago próximo a caducar.',
  OVERDUE_REPORT_DUE: 'Informe semanal de impagos (cron).',
  MEMBER_CREDIT_APPLIED: 'Se aplica saldo a favor en la cuenta del socio.',
  SEASON_RENEWAL_DUE: 'Ventana de renovación de temporada.',
  ACCOUNTING_EXPORT_DUE: 'Export contable programado (cron).',
  EVENT_CANCELLED: 'Un evento del calendario se cancela.',
  EVENT_RESCHEDULED: 'Cambian fecha u hora de un evento.',
  EVENT_STARTING_SOON: 'Recordatorio antes del inicio (cron de eventos).',
  EVENT_COMPLETED: 'El evento finaliza (asistencia o cierre).',
  ATTENDANCE_ABSENT_UNEXCUSED: 'Ausencia sin justificar tras pasar lista.',
  DOCUMENT_EXPIRING: 'Documento del socio próximo a caducar (job document-expiring).',
  CONVOCATION_PUBLISHED: 'Se publica una convocatoria para un evento.',
  COACH_ASSIGNED: 'Se asigna entrenador titular a un grupo.',
  COACH_SUBSTITUTION_ASSIGNED: 'Sustitución de entrenador en un evento o grupo.',
  TEAM_CHANGE_APPROVED: 'Cambio de grupo aprobado por la dirección.',
  EVALUATION_PUBLISHED: 'Se publica evaluación deportiva del socio.',
  BULK_MESSAGE_REQUESTED: 'Comunicación masiva lanzada desde el CRM.',
  INCIDENT_RESOLVED: 'Se cierra una incidencia del socio.',
  CONSENT_PENDING: 'Faltan firmas o consentimientos obligatorios.',
}

const ACTION_DESCRIPTIONS: Record<string, string> = {
  ASSIGN_TEAM: 'Asigna al socio a un equipo concreto (rol jugador).',
  ASSIGN_TEAM_BY_AGE:
    'Asigna al equipo configurado si la edad del socio está entre mínimo y máximo.',
  ASSIGN_TEAM_BY_PREFERENCE: 'Asigna según la preferencia deportiva guardada en la ficha.',
  REMOVE_FROM_TEAM: 'Quita al socio del equipo indicado (o del asignado si está vacío).',
  SET_MEMBER_STATUS: 'Actualiza el estado del socio (activo, baja, pendiente, etc.).',
  SET_MEMBER_SPORT_PREFERENCE: 'Guarda la preferencia deportiva en la ficha.',
  SET_MEMBER_CONTACT: 'Actualiza email, teléfono o dirección del socio.',
  SET_MEMBER_DNI: 'Guarda o corrige el DNI/NIE del socio.',
  SET_MEMBER_BIRTHDATE: 'Actualiza la fecha de nacimiento.',
  CREATE_PAYMENT: 'Crea un cobro legacy en contabilidad (importe y concepto).',
  CREATE_INVITE_SIGNUP_LINK: 'Genera enlace de inscripción para invitar a un lead (no para socios ya dados de alta).',
  CREATE_SIGNUP_LINK: 'Enlace de alta para el propio socio; no usar en MEMBER_CREATED.',
  CREATE_TRANSACTION: 'Registra un movimiento en el libro contable.',
  SEND_WHATSAPP: 'Envía WhatsApp al teléfono del socio (ApiWass). Soporta variables {nombre}, etc.',
  SEND_WHATSAPP_TO_COACH: 'Mensaje al entrenador del equipo (o equipo del paso).',
  SEND_WHATSAPP_TO_TEAM: 'Envía el mismo mensaje a todos los jugadores del grupo.',
  SEND_PAYMENT_LINK: 'Envía enlace de pago Stripe al socio.',
  SEND_INVOICE_PDF_WHATSAPP: 'Adjunta o envía la factura en PDF por WhatsApp.',
  CREATE_SUBSCRIPTION: 'Crea suscripción Stripe con el plan configurado.',
  CREATE_INVOICE_FROM_PLAN: 'Genera factura según plan de cuotas del socio.',
  GENERATE_TEAM_SESSIONS: 'Crea eventos de entrenamiento en calendario para el grupo (semanas configurables).',
  GENERATE_RESPONSE_LINK:
    'Crea token y URL pública (/r/...) para que el socio responda (asistencia, convocatoria, prueba).',
  APPLY_DISCOUNT_RULES: 'Aplica reglas de descuento y becas activas del club.',
  RETRY_PAYMENT: 'Reintenta un cobro fallido en Stripe.',
  SEND_OVERDUE_REPORT: 'Envía resumen de facturas impagadas (admin o socio).',
  CALCULATE_PRORATED_REFUND: 'Calcula devolución prorrateada al dar de baja.',
  CANCEL_SUBSCRIPTION: 'Cancela la suscripción Stripe del socio.',
  TRIGGER_WAITLIST_NOTIFY: 'Dispara aviso a socios en lista de espera cuando hay plaza.',
  HTTP_REQUEST: 'Llama a una URL externa (webhook). Body y headers configurables.',
  BRANCH_IF:
    'Evalúa una condición y sigue la rama Sí o No del lienzo (then/else). Sin bucles infinitos.',
}

export function workflowTriggerDescription(triggerType: string): string {
  return (
    TRIGGER_DESCRIPTIONS[triggerType] ??
    'Disparador guardado en el flujo. Comprueba que el sistema emita este evento (API, webhook o cron).'
  )
}

export function workflowActionDescription(actionType: string): string {
  if (actionType === '_TRIGGER') return ''
  return (
    ACTION_DESCRIPTIONS[actionType] ??
    'Acción del flujo. Configura los campos del panel para que el motor la ejecute al llegar a este paso.'
  )
}

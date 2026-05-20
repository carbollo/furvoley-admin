import { defineProclubWorkflow, type ProclubCatalogEntry } from '@/lib/proclub-workflow-catalog/types'

export const ENROLLMENT_PROCLUB_WORKFLOWS: ProclubCatalogEntry[] = [
  defineProclubWorkflow('WI-1', {
    area: 'enrollment',
    automation: 'auto',
    phase: 2,
    name: 'WI-1 · Envío del formulario de inscripción',
    description: 'Lead apto: enlace de inscripción por WhatsApp.',
    triggerType: 'LEAD_UPDATED',
    triggerConfig: { onlyWhenLeadStatus: 'APPROVED' },
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'CREATE_SIGNUP_LINK',
        config: { stepKey: 'wi1_link', label: 'Enlace inscripción', maxUses: '1', expiresInDays: '14' },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wi1_wa',
          label: 'Enviar formulario',
          waPhone: '{triggerMemberPhone}',
          waMessage: 'Completa la inscripción aquí: {signupLinkUrl}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WI-2', {
    area: 'enrollment',
    automation: 'mixed',
    phase: 2,
    name: 'WI-2 · Validación y detección de menor',
    description: 'Socio creado menor: recordatorio validación admin.',
    triggerType: 'MEMBER_CREATED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wi2_admin',
          label: 'Validar menor',
          waPhone: '{clubAdminPhone}',
          waMessage: 'Nuevo socio {memberName} requiere validación de tutor/DNI en el CRM.',
        },
      },
    ],
  }),
  defineProclubWorkflow('WI-3', {
    area: 'enrollment',
    automation: 'auto',
    phase: 2,
    name: 'WI-3 · Recogida de firmas de documentos del club',
    description: 'Recordatorio si consentimientos pendientes 48h.',
    triggerType: 'CONSENT_PENDING',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'GENERATE_RESPONSE_LINK',
        config: { stepKey: 'wi3_link', label: 'Enlace firmas', linkType: 'CONSENT' },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wi3_wa',
          label: 'Recordatorio firmas',
          waPhone: '{guardianPhone}',
          waMessage: 'Faltan documentos por firmar para {memberName}: {responseLink}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WI-4', {
    area: 'enrollment',
    automation: 'auto',
    phase: 2,
    name: 'WI-4 · Onboarding post-inscripción',
    description: 'Bienvenida con horarios, entrenador y primer cobro.',
    triggerType: 'MEMBER_CREATED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wi4_wa',
          label: 'Bienvenida',
          waPhone: '{guardianPhone}',
          waMessage:
            '¡Bienvenido/a {memberName}! Horarios: {teamScheduleSummary}. Entrenador: {coachName}. Próximo paso: completar el pago en el enlace que recibirás.',
        },
      },
    ],
  }),
]

import { defineProclubWorkflow, type ProclubCatalogEntry } from '@/lib/proclub-workflow-catalog/types'

export const LEAVE_PROCLUB_WORKFLOWS: ProclubCatalogEntry[] = [
  defineProclubWorkflow('WB-1', {
    area: 'leave',
    automation: 'mixed',
    phase: 4,
    name: 'WB-1 · Solicitud de baja',
    description: 'Solicitud recibida: aviso al admin para confirmar fecha.',
    triggerType: 'MEMBER_LEAVE_REQUESTED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wb1_admin',
          label: 'Aviso admin baja',
          waPhone: '{clubAdminPhone}',
          waMessage: 'Solicitud de baja de {memberName}. Revisa en el CRM.',
        },
      },
    ],
  }),
  defineProclubWorkflow('WB-2', {
    area: 'leave',
    automation: 'auto',
    phase: 4,
    name: 'WB-2 · Cancelación de cuotas futuras',
    description: 'Baja confirmada: cancelar suscripción activa.',
    triggerType: 'MEMBER_STATUS_CHANGED',
    triggerConfig: { onlyWhenCurrentStatus: 'INACTIVE' },
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'CANCEL_SUBSCRIPTION',
        config: { stepKey: 'wb2_cancel', label: 'Cancelar suscripción' },
      },
    ],
  }),
  defineProclubWorkflow('WB-3', {
    area: 'leave',
    automation: 'auto',
    phase: 4,
    name: 'WB-3 · Liberación de la plaza y aviso a lista de espera',
    description: 'Tras baja: notificar lista de espera (engancha WP-5).',
    triggerType: 'MEMBER_STATUS_CHANGED',
    triggerConfig: { onlyWhenCurrentStatus: 'INACTIVE' },
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'TRIGGER_WAITLIST_NOTIFY',
        config: { stepKey: 'wb3_wait', label: 'Avisar lista espera', teamId: '' },
      },
    ],
  }),
  defineProclubWorkflow('WB-4', {
    area: 'leave',
    automation: 'auto',
    phase: 4,
    name: 'WB-4 · Comunicación de cierre + encuesta de motivo',
    description: 'Baja efectiva: mensaje de cierre con encuesta.',
    triggerType: 'MEMBER_STATUS_CHANGED',
    triggerConfig: { onlyWhenCurrentStatus: 'INACTIVE' },
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'GENERATE_RESPONSE_LINK',
        config: { stepKey: 'wb4_link', label: 'Encuesta baja', linkType: 'LEAVE_SURVEY' },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wb4_wa',
          label: 'Encuesta motivo',
          waPhone: '{guardianPhone}',
          waMessage: 'Lamentamos tu baja. Ayúdanos con tu opinión: {responseLink}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WB-5', {
    area: 'leave',
    automation: 'auto',
    phase: 4,
    name: 'WB-5 · Campaña de retorno a los X meses',
    description: 'Retorno programado tras baja no traumática.',
    triggerType: 'MEMBER_RETURN_CAMPAIGN',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wb5_wa',
          label: 'Campaña retorno',
          waPhone: '{guardianPhone}',
          waMessage: 'Hola, ¿te apetece volver al club esta temporada? Escríbenos si te interesa.',
        },
      },
    ],
  }),
]

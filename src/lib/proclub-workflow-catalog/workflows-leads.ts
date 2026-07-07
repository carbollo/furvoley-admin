import { defineProclubWorkflow, type ProclubCatalogEntry } from '@/lib/proclub-workflow-catalog/types'

export const LEADS_PROCLUB_WORKFLOWS: ProclubCatalogEntry[] = [
  defineProclubWorkflow('WP-1', {
    area: 'leads',
    automation: 'auto',
    phase: 2,
    name: 'WP-1 · Alta de lead y asignación de grupo provisional',
    description: 'Lead captado: asignación provisional por edad o lista de espera.',
    triggerType: 'LEAD_CREATED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'ASSIGN_TEAM_BY_AGE',
        config: { stepKey: 'wp1_assign', label: 'Grupo provisional', groupId: '', minAge: '', maxAge: '' },
      },
    ],
  }),
  defineProclubWorkflow('WP-2', {
    area: 'leads',
    automation: 'auto',
    phase: 2,
    name: 'WP-2 · Información inicial al lead',
    description: 'WhatsApp con horarios, ubicación y cuotas.',
    triggerType: 'LEAD_CREATED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wp2_wa',
          label: 'Info al lead',
          waPhone: '{triggerMemberPhone}',
          waMessage:
            'Hola {triggerMemberName}, gracias por contactar con el club. Horarios y cuotas en nuestra web. ¿Quieres una prueba?',
        },
      },
    ],
  }),
  defineProclubWorkflow('WP-3', {
    area: 'leads',
    automation: 'auto',
    phase: 2,
    name: 'WP-3 · Notificación al entrenador',
    description: 'Nuevo lead en grupo provisional: aviso al entrenador.',
    triggerType: 'LEAD_CREATED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP_TO_COACH',
        config: {
          stepKey: 'wp3_coach',
          label: 'Aviso entrenador',
          groupId: '',
          waMessage: 'Nuevo lead en tu grupo: {triggerMemberName}. Tel: {triggerMemberPhone}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WP-4', {
    area: 'leads',
    automation: 'auto',
    phase: 2,
    name: 'WP-4 · Confirmación 5h antes de la prueba',
    description: 'Recordatorio de prueba con enlace confirmar/no puede.',
    triggerType: 'TRIAL_REMINDER_DUE',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'GENERATE_RESPONSE_LINK',
        config: { stepKey: 'wp4_link', label: 'Enlace prueba', linkType: 'TRIAL' },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wp4_wa',
          label: 'Recordatorio prueba',
          waPhone: '{triggerMemberPhone}',
          waMessage: 'Recordatorio: prueba el {trialDate}. Confirma o cancela: {responseLink}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WP-5', {
    area: 'leads',
    automation: 'auto',
    phase: 2,
    name: 'WP-5 · Aviso de hueco a la lista de espera',
    description: 'Plaza libre: aviso al siguiente en lista de espera.',
    triggerType: 'WAITLIST_SLOT_AVAILABLE',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wp5_wa',
          label: 'Hueco lista espera',
          waPhone: '{triggerMemberPhone}',
          waMessage: 'Hay plaza disponible en el club. Responde si quieres inscribirte.',
        },
      },
    ],
  }),
  defineProclubWorkflow('WP-6', {
    area: 'leads',
    automation: 'auto',
    phase: 2,
    name: 'WP-6 · Seguimiento del lead frío',
    description: 'Seguimiento automático si no se inscribe tras la prueba.',
    triggerType: 'LEAD_COLD_FOLLOWUP',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wp6_wa',
          label: 'Seguimiento lead',
          waPhone: '{triggerMemberPhone}',
          waMessage:
            'Hola {triggerMemberName}, ¿sigues interesado en unirte al club? Podemos agendar otra prueba.',
        },
      },
    ],
  }),
]

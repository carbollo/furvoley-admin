import { WD1_WORKFLOW } from '@/lib/default-workflows/wd-1'
import { WD2_WORKFLOW } from '@/lib/default-workflows/wd-2'
import type { ImportableWorkflow } from '@/lib/workflow-import'
import { defineProclubWorkflow, type ProclubCatalogEntry } from '@/lib/proclub-workflow-catalog/types'

function wd1Entry(): ProclubCatalogEntry {
  const wf = WD1_WORKFLOW as unknown as ImportableWorkflow
  return {
    catalogId: 'WD-1',
    area: 'sport',
    automation: 'auto',
    phase: 1,
    workflow: { ...wf, description: WD1_WORKFLOW.description },
  }
}

function wd2Entry(): ProclubCatalogEntry {
  const wf = WD2_WORKFLOW as unknown as ImportableWorkflow
  return {
    catalogId: 'WD-2',
    area: 'sport',
    automation: 'auto',
    phase: 1,
    workflow: { ...wf, description: WD2_WORKFLOW.description },
  }
}

export const SPORT_PROCLUB_WORKFLOWS: ProclubCatalogEntry[] = [
  wd1Entry(),
  wd2Entry(),
  // OJO: este era 'WD-3' y chocaba con el flujo de cobro al alta, que usa ese
  // mismo identificador (src/lib/default-workflows/wd-3.ts). Instalar el
  // catálogo deportivo encontraba aquel por su identificador, le borraba los
  // pasos y lo reescribía como este: el club se quedaba sin enviar el enlace de
  // pago al dar de alta a nadie, y sin ninguna señal de que hubiera pasado.
  //
  // Se renumera ESTE, no el de cobro: bajar el de cobro a otro identificador
  // haría que los clubes que hoy tienen uno sano se crearan un SEGUNDO flujo de
  // cobro, y el socio recibiría dos mensajes.
  defineProclubWorkflow('WD-3S', {
    area: 'sport',
    automation: 'auto',
    phase: 1,
    name: 'WD-3 · Pase de lista y recordatorio al entrenador',
    description: 'X min antes de la sesión: WhatsApp al entrenador con enlace al pase de lista.',
    triggerType: 'EVENT_STARTING_SOON',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'GENERATE_RESPONSE_LINK',
        config: {
          stepKey: 'wd3_link',
          label: 'Enlace pase de lista',
          linkType: 'ATTENDANCE',
        },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP_TO_COACH',
        config: {
          stepKey: 'wd3_coach',
          label: 'Recordatorio entrenador',
          groupId: '',
          waMessage:
            'Hola {coachName}, en breve empieza {eventTitle} ({eventDate}). Pase de lista: {responseLink}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WD-4', {
    area: 'sport',
    automation: 'auto',
    phase: 1,
    name: 'WD-4 · Aviso al tutor por falta no justificada',
    description: 'Falta sin justificar: WhatsApp al tutor con enlace para indicar motivo.',
    triggerType: 'ATTENDANCE_ABSENT_UNEXCUSED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'GENERATE_RESPONSE_LINK',
        config: {
          stepKey: 'wd4_link',
          label: 'Enlace motivo falta',
          linkType: 'ATTENDANCE_REASON',
        },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wd4_tutor',
          label: 'Aviso tutor',
          waPhone: '{guardianPhone}',
          waMessage:
            'Hola, {memberName} consta como ausente en {eventTitle}. Indica el motivo aquí: {responseLink}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WD-5', {
    area: 'sport',
    automation: 'auto',
    phase: 1,
    name: 'WD-5 · Cancelación o cambio de horario de sesión',
    description: 'Sesión cancelada o reprogramada: aviso WhatsApp a toda la plantilla.',
    triggerType: 'EVENT_CANCELLED',
    triggerConfig: { eventKinds: ['EVENT_CANCELLED', 'EVENT_RESCHEDULED'] },
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP_TO_TEAM',
        config: {
          stepKey: 'wd5_team',
          label: 'Avisar plantilla',
          groupId: '',
          waMessage:
            'Aviso del club: la sesión «{eventTitle}» del {eventDate} ha cambiado o se ha cancelado. Revisa el calendario en el CRM.',
        },
      },
    ],
  }),
  defineProclubWorkflow('WD-6', {
    area: 'sport',
    automation: 'mixed',
    phase: 2,
    name: 'WD-6 · Sustitución de entrenador en una sesión',
    description: 'Sustituto asignado: aviso al sustituto y opcionalmente al grupo.',
    triggerType: 'COACH_SUBSTITUTION_ASSIGNED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wd6_sub',
          label: 'Aviso sustituto',
          waPhone: '{substituteCoachPhone}',
          waMessage:
            'Hola {substituteCoachName}, te han asignado la sesión {eventTitle} ({eventDate}) del grupo {assignedTeamName}.',
        },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP_TO_TEAM',
        config: {
          stepKey: 'wd6_team',
          label: 'Aviso grupo (opcional)',
          groupId: '',
          waMessage:
            'El entrenamiento {eventTitle} del {eventDate} será impartido por {substituteCoachName}.',
        },
      },
    ],
  }),
  defineProclubWorkflow('WD-7', {
    area: 'sport',
    automation: 'auto',
    phase: 2,
    name: 'WD-7 · Convocatoria a partido o evento',
    description: 'Convocatoria publicada: WhatsApp a convocados con enlace confirmar/no puede.',
    triggerType: 'CONVOCATION_PUBLISHED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'GENERATE_RESPONSE_LINK',
        config: {
          stepKey: 'wd7_link',
          label: 'Enlace convocatoria',
          linkType: 'CONVOCATION',
        },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wd7_invite',
          label: 'Convocatoria tutor',
          waPhone: '{guardianPhone}',
          waMessage:
            'Convocatoria: {eventTitle} · {eventDate} · {eventLocation}. Confirma asistencia: {responseLink}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WD-8', {
    area: 'sport',
    automation: 'auto',
    phase: 2,
    name: 'WD-8 · Aviso al jugador no convocado',
    description: 'Tras publicar convocatoria: mensaje a quienes no están convocados.',
    triggerType: 'CONVOCATION_PUBLISHED',
    triggerConfig: { audience: 'NOT_CALLED' },
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wd8_msg',
          label: 'No convocado',
          waPhone: '{guardianPhone}',
          waMessage:
            'Hola, {memberName} no está convocado/a para {eventTitle} del {eventDate}. Cualquier duda, contacta con el entrenador.',
        },
      },
    ],
  }),
  defineProclubWorkflow('WD-9', {
    area: 'sport',
    automation: 'mixed',
    phase: 2,
    name: 'WD-9 · Recogida de resultado del partido',
    description: 'Tras el partido: recordatorio al entrenador para registrar resultado.',
    triggerType: 'EVENT_COMPLETED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'GENERATE_RESPONSE_LINK',
        config: {
          stepKey: 'wd9_link',
          label: 'Enlace resultado',
          linkType: 'MATCH_RESULT',
        },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP_TO_COACH',
        config: {
          stepKey: 'wd9_coach',
          label: 'Recordatorio resultado',
          groupId: '',
          waMessage: 'Partido finalizado: {eventTitle}. Registra el resultado aquí: {responseLink}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WD-10', {
    area: 'sport',
    automation: 'mixed',
    phase: 2,
    name: 'WD-10 · Cambio de grupo de un jugador',
    description: 'Cambio de grupo aprobado: baja del anterior, alta en el nuevo, avisos.',
    triggerType: 'TEAM_CHANGE_APPROVED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'REMOVE_FROM_TEAM',
        config: { stepKey: 'wd10_out', label: 'Quitar grupo anterior', groupId: '{fromGroupId}' },
      },
      {
        position: 1,
        stepType: 'ACTION',
        actionType: 'ASSIGN_TEAM',
        config: { stepKey: 'wd10_in', label: 'Alta nuevo grupo', groupId: '{toGroupId}' },
      },
      {
        position: 2,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wd10_tutor',
          label: 'Aviso tutor',
          waPhone: '{guardianPhone}',
          waMessage:
            'Hola, {memberName} pasa al grupo {assignedTeamName}. Horarios: {teamScheduleSummary}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WD-11', {
    area: 'sport',
    automation: 'mixed',
    phase: 3,
    name: 'WD-11 · Entrega periódica de evaluación al tutor',
    description: 'Evaluación cerrada: envío al tutor por WhatsApp.',
    triggerType: 'EVALUATION_PUBLISHED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wd11_tutor',
          label: 'Evaluación al tutor',
          waPhone: '{guardianPhone}',
          waMessage:
            'Evaluación de {memberName} disponible. Resumen: {evaluationSummary}. Más detalle en el CRM.',
        },
      },
    ],
  }),
  defineProclubWorkflow('WD-12', {
    area: 'sport',
    automation: 'auto',
    phase: 3,
    name: 'WD-12 · Aviso de vencimiento de licencia / revisión médica',
    description: '30/15/5 días antes del vencimiento: aviso al tutor.',
    triggerType: 'DOCUMENT_EXPIRING',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wd12_tutor',
          label: 'Vencimiento documento',
          waPhone: '{guardianPhone}',
          waMessage:
            'Hola, el documento «{documentType}» de {memberName} vence el {documentExpiryDate}. Renueva según instrucciones del club.',
        },
      },
    ],
  }),
  defineProclubWorkflow('WD-13', {
    area: 'sport',
    automation: 'auto',
    phase: 3,
    name: 'WD-13 · Comunicación masiva segmentada',
    description: 'Mensaje masivo a un grupo por WhatsApp.',
    triggerType: 'BULK_MESSAGE_REQUESTED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP_TO_TEAM',
        config: {
          stepKey: 'wd13_bulk',
          label: 'Envío masivo',
          groupId: '',
          waMessage: '{bulkMessage}',
        },
      },
    ],
  }),
  defineProclubWorkflow('WD-14', {
    area: 'sport',
    automation: 'mixed',
    phase: 2,
    name: 'WD-14 · Onboarding del entrenador a un grupo nuevo',
    description: 'Entrenador asignado a grupo: bienvenida con plantilla y horarios.',
    triggerType: 'COACH_ASSIGNED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wd14_coach',
          label: 'Bienvenida entrenador',
          waPhone: '{coachPhone}',
          waMessage:
            'Hola {coachName}, eres entrenador/a de {assignedTeamName}. Horarios: {teamScheduleSummary}. Ubicación: {teamTrainingLocation}. Revisa la plantilla en el CRM.',
        },
      },
    ],
  }),
  defineProclubWorkflow('WD-15', {
    area: 'sport',
    automation: 'mixed',
    phase: 3,
    name: 'WD-15 · Buzón de incidencias del entrenador',
    description: 'Incidencia resuelta: notificación al entrenador.',
    triggerType: 'INCIDENT_RESOLVED',
    steps: [
      {
        position: 0,
        stepType: 'ACTION',
        actionType: 'SEND_WHATSAPP',
        config: {
          stepKey: 'wd15_coach',
          label: 'Incidencia resuelta',
          waPhone: '{coachPhone}',
          waMessage: 'Tu incidencia «{incidentTitle}» ha sido resuelta: {incidentResolution}',
        },
      },
    ],
  }),
]

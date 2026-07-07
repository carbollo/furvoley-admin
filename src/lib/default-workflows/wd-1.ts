/** WD-1 · Alta del jugador en plantilla del grupo (PROCLUB). */

export const WD1_CATALOG_ID = 'WD-1'

export const WD1_WORKFLOW = {
  name: 'WD-1 · Alta del jugador en plantilla del grupo',
  description:
    '[WD-1] Inscripción cerrada o cambio de grupo: plantilla, aviso entrenador y datos al tutor. Configura el paso «Asignar por edad» con tu equipo.',
  triggerType: 'TEAM_ROSTER_CONFIRMED',
  triggerConfig: {
    catalogId: WD1_CATALOG_ID,
    eventKinds: ['MEMBER_CREATED', 'TEAM_ROSTER_CONFIRMED'],
  },
  isActive: true,
  steps: [
    {
      position: 0,
      stepType: 'ACTION',
      actionType: 'ASSIGN_TEAM_BY_AGE',
      config: {
        stepKey: 'wd1_assign',
        label: 'Incorporar a plantilla',
        groupId: '',
        minAge: '',
        maxAge: '',
      },
    },
    {
      position: 1,
      stepType: 'ACTION',
      actionType: 'SEND_WHATSAPP_TO_COACH',
      config: {
        stepKey: 'wd1_coach',
        label: 'Avisar entrenador',
        groupId: '',
        waSessionId: '',
        waMessage:
          'Hola {coachName}, se ha incorporado a {assignedTeamName} el jugador/a {memberName}. Revisa la plantilla en el CRM.',
      },
    },
    {
      position: 2,
      stepType: 'ACTION',
      actionType: 'SEND_WHATSAPP',
      config: {
        stepKey: 'wd1_tutor',
        label: 'Datos al tutor',
        waSessionId: '',
        waPhone: '{guardianPhone}',
        waMessage:
          'Hola, {memberName} ya está en {assignedTeamName}.\n\nHorarios: {teamScheduleSummary}\nSede: {teamTrainingLocation}\nEntrenador/a: {coachName} · {coachPhone}',
      },
    },
  ],
} as const

/** WD-2 · Generación automática del calendario de entrenamientos (PROCLUB). */

export const WD2_CATALOG_ID = 'WD-2'

export const WD2_WORKFLOW = {
  name: 'WD-2 · Generación automática del calendario de entrenamientos',
  description:
    '[WD-2] Al guardar o quitar horarios fijos del grupo, genera entrenamientos hasta fin de temporada (excluye festivos del club).',
  triggerType: 'TEAM_SCHEDULE_CHANGED',
  triggerConfig: {
    catalogId: WD2_CATALOG_ID,
  },
  isActive: true,
  steps: [
    {
      position: 0,
      stepType: 'ACTION',
      actionType: 'GENERATE_TEAM_SESSIONS',
      config: {
        stepKey: 'wd2_generate',
        label: 'Generar calendario del grupo',
        groupId: '',
        regenerate: true,
        untilSeasonEnd: true,
        weeksAhead: '4',
      },
    },
  ],
} as const

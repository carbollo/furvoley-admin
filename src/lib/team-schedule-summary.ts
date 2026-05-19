const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export type TeamScheduleRow = {
  weekday: number
  startTime: string
  location?: string | null
  title?: string | null
}

export function formatTeamScheduleSummary(schedules: TeamScheduleRow[]): string {
  if (schedules.length === 0) return '—'
  return schedules
    .slice()
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
    .map((s) => {
      const day = WEEKDAY_LABELS[s.weekday] ?? `D${s.weekday}`
      const loc = s.location?.trim() ? ` · ${s.location.trim()}` : ''
      return `${day} ${s.startTime}${loc}`
    })
    .join(' | ')
}

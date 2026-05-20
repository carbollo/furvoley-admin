/** Estados persistidos en `Member.status` para filtros de workflows y CRM. */

export const MEMBER_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'INACTIVE', label: 'Baja / Inactivo' },
  { value: 'PAUSED', label: 'En pausa' },
  { value: 'LEAD', label: 'Lead (pendiente de alta)' },
] as const

export function memberStatusLabel(status: string): string {
  const o = MEMBER_STATUS_OPTIONS.find((x) => x.value === status)
  return o?.label ?? status
}

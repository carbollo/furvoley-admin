export const APP_ROLES = ['ADMIN', 'COACH', 'TREASURER', 'MEMBER'] as const
export type AppRole = (typeof APP_ROLES)[number]
export type LegacyRole = AppRole | 'PLAYER'

export const ROLE_LABEL: Record<AppRole, string> = {
  ADMIN: 'Administrador',
  COACH: 'Entrenador',
  TREASURER: 'Tesorero',
  MEMBER: 'Socio',
}

export type CrmSectionId =
  | 'dashboard'
  | 'socios'
  | 'equipos'
  | 'cuotas'
  | 'contabilidad'
  | 'calendario'
  | 'informes'
  | 'workflows'
  | 'whatsapp'
  | 'hermes'
  | 'personal'

const CRM_SECTIONS_BY_ROLE: Record<AppRole, CrmSectionId[]> = {
  ADMIN: ['dashboard', 'socios', 'equipos', 'cuotas', 'contabilidad', 'calendario', 'informes', 'workflows', 'whatsapp', 'hermes', 'personal'],
  COACH: ['equipos', 'calendario'],
  TREASURER: ['cuotas', 'contabilidad', 'informes'],
  MEMBER: [],
}

export function normalizeRole(input: unknown): AppRole {
  const role = String(input || '').toUpperCase()
  if (role === 'PLAYER') return 'MEMBER'
  if ((APP_ROLES as readonly string[]).includes(role)) return role as AppRole
  return 'MEMBER'
}

export function hasRole(role: unknown, allowed: AppRole[]) {
  const normalized = normalizeRole(role)
  return allowed.includes(normalized)
}

export function canAccessCrmSection(role: unknown, section: CrmSectionId) {
  const normalized = normalizeRole(role)
  return CRM_SECTIONS_BY_ROLE[normalized].includes(section)
}

export function getAllowedCrmSections(role: unknown) {
  const normalized = normalizeRole(role)
  return CRM_SECTIONS_BY_ROLE[normalized]
}

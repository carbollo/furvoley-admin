import type { CrmSectionId } from '@/lib/rbac'

/**
 * Módulos del CRM que el super-admin puede activar/desactivar por club
 * (feature flags). Cada módulo agrupa una o varias secciones del CRM; las
 * secciones que no pertenecen a ningún módulo son "core" y siempre están.
 *
 * `features` (Tenant.features): mapa moduleId → habilitado. Ausente = habilitado
 * (por defecto todo activado), así que solo se guardan las desactivaciones.
 */

export type CrmModuleId = 'contabilidad' | 'workflows' | 'whatsapp' | 'hermes' | 'entrenamiento'

export type TenantFeatures = Partial<Record<CrmModuleId, boolean>>

export const CRM_MODULES: { id: CrmModuleId; label: string; sections: CrmSectionId[] }[] = [
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    sections: ['contabilidad', 'facturas', 'impagos', 'productos', 'descuentos'],
  },
  { id: 'workflows', label: 'Flujos (workflows)', sections: ['workflows'] },
  { id: 'whatsapp', label: 'WhatsApp', sections: ['whatsapp'] },
  { id: 'hermes', label: 'Bot (Hermes)', sections: ['hermes'] },
  { id: 'entrenamiento', label: 'Entrenamiento', sections: ['entrenamiento'] },
]

const SECTION_MODULE = new Map<string, CrmModuleId>()
for (const m of CRM_MODULES) for (const s of m.sections) SECTION_MODULE.set(s, m.id)

/** ¿Está activado un módulo? Ausente en `features` = activado. */
export function isModuleEnabled(module: CrmModuleId, features: TenantFeatures | null | undefined): boolean {
  return features?.[module] !== false
}

/**
 * ¿Se muestra esta sección? Las secciones "core" (sin módulo) siempre; las de un
 * módulo, según su flag. Robusto ante `features` nulo (todo activado).
 */
export function isSectionEnabled(
  section: CrmSectionId | string,
  features: TenantFeatures | null | undefined,
): boolean {
  const module = SECTION_MODULE.get(String(section))
  if (!module) return true
  return isModuleEnabled(module, features)
}

/** Normaliza un objeto arbitrario (de la BD/red) a un TenantFeatures válido. */
export function sanitizeFeatures(input: unknown): TenantFeatures {
  const out: TenantFeatures = {}
  if (!input || typeof input !== 'object') return out
  for (const m of CRM_MODULES) {
    const v = (input as Record<string, unknown>)[m.id]
    if (typeof v === 'boolean') out[m.id] = v
  }
  return out
}

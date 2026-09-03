import type { CrmSectionId } from '@/lib/rbac'

/**
 * Módulos del CRM que el super-admin puede activar/desactivar por club
 * (feature flags). Cada módulo agrupa una o varias secciones del CRM; las
 * secciones que no pertenecen a ningún módulo son "core" y siempre están.
 *
 * `features` (Tenant.features): mapa moduleId → habilitado. Ausente = habilitado
 * (por defecto todo activado), así que solo se guardan las desactivaciones.
 */

export type CrmModuleId =
  | 'inicio'
  | 'calendario'
  | 'entrenamiento'
  | 'whatsapp'
  | 'socios'
  | 'admin'
  | 'contabilidad'
  | 'workflows'
  | 'hermes'

/**
 * Qué tiene contratado un club.
 *
 * Admite claves de MÓDULO y de SECCIÓN, y ausente sigue significando activado
 * (solo se guardan las desactivaciones). Empezó siendo solo por módulo, pero los
 * planes reales parten módulos por la mitad: «Administración» se vende sin
 * Asistencia, y «Contabilidad» sin Descuentos. Con granularidad de módulo eso no
 * se puede expresar, así que o se regalaba lo que no se había pagado o se
 * quitaba de más.
 */
export type TenantFeatures = Partial<Record<CrmModuleId | CrmSectionId, boolean>>

/**
 * Cada pestaña del CRM es un módulo activable/desactivable por club. El orden es el
 * del menú lateral. Al desactivar un módulo, todas sus secciones desaparecen del
 * sidebar (isSectionEnabled) y su pestaña queda inaccesible; el CRM abre la primera
 * pestaña disponible (firstAllowed). Nota: `inicio` (Panel) también es un módulo por
 * petición; si se desactiva, el CRM abre en la siguiente pestaña activa.
 */
export const CRM_MODULES: { id: CrmModuleId; label: string; sections: CrmSectionId[] }[] = [
  { id: 'inicio', label: 'Inicio', sections: ['dashboard'] },
  { id: 'calendario', label: 'Calendario', sections: ['calendario'] },
  { id: 'entrenamiento', label: 'Entrenamiento', sections: ['entrenamiento'] },
  { id: 'whatsapp', label: 'Chat', sections: ['whatsapp'] },
  { id: 'socios', label: 'Socios', sections: ['socios'] },
  {
    id: 'admin',
    label: 'Admin',
    sections: ['admin-sumario', 'organigrama', 'contactos', 'asistencia', 'personal'],
  },
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    sections: ['contabilidad', 'facturas', 'banco', 'cuotas', 'impagos', 'productos', 'descuentos', 'informes'],
  },
  { id: 'workflows', label: 'Flujos (workflows)', sections: ['workflows'] },
  { id: 'hermes', label: 'Bot (Hermes)', sections: ['hermes'] },
]

/**
 * Todas las secciones del CRM, en el orden del menú, con la etiqueta que ve el
 * club y el módulo al que pertenecen (`null` = no cuelga de ninguno).
 *
 * Es lo que se pinta al montar un plan: el vendedor razona en secciones («¿le
 * doy Descuentos?»), no en módulos.
 */
export const CRM_SECTIONS: {
  id: CrmSectionId
  label: string
  module: CrmModuleId | null
  /** Grupo con el que se agrupa en pantalla. */
  grupo: string
}[] = [
  { id: 'dashboard', label: 'Panel de inicio', module: 'inicio', grupo: 'Inicio' },
  { id: 'calendario', label: 'Calendario de eventos', module: 'calendario', grupo: 'Calendario y comunicación' },
  { id: 'whatsapp', label: 'Chat vinculado a WhatsApp', module: 'whatsapp', grupo: 'Calendario y comunicación' },
  { id: 'socios', label: 'Socios', module: 'socios', grupo: 'Administración' },
  { id: 'admin-sumario', label: 'Sumario (KPIs jugadores)', module: 'admin', grupo: 'Administración' },
  { id: 'organigrama', label: 'Organigrama (grupos y herencia)', module: 'admin', grupo: 'Administración' },
  { id: 'contactos', label: 'Contactos', module: 'admin', grupo: 'Administración' },
  { id: 'asistencia', label: 'Asistencia', module: 'admin', grupo: 'Administración' },
  { id: 'personal', label: 'Personal', module: 'admin', grupo: 'Administración' },
  { id: 'contabilidad', label: 'Sumario financiero', module: 'contabilidad', grupo: 'Contabilidad' },
  { id: 'facturas', label: 'Facturas', module: 'contabilidad', grupo: 'Contabilidad' },
  { id: 'cuotas', label: 'Suscripciones', module: 'contabilidad', grupo: 'Contabilidad' },
  { id: 'banco', label: 'Banco', module: 'contabilidad', grupo: 'Contabilidad' },
  { id: 'productos', label: 'Productos', module: 'contabilidad', grupo: 'Contabilidad' },
  { id: 'impagos', label: 'Impagos', module: 'contabilidad', grupo: 'Contabilidad' },
  { id: 'descuentos', label: 'Descuentos', module: 'contabilidad', grupo: 'Contabilidad' },
  { id: 'informes', label: 'Informes', module: 'contabilidad', grupo: 'Contabilidad' },
  { id: 'hermes', label: 'Bot de soporte (Hermes)', module: 'hermes', grupo: 'Configuración' },
  { id: 'forms', label: 'Formulario de inscripción', module: null, grupo: 'Configuración' },
  { id: 'workflows', label: 'Flujos (automatizaciones)', module: 'workflows', grupo: 'Configuración' },
  { id: 'api', label: 'API / integraciones', module: null, grupo: 'Configuración' },
  { id: 'entrenamiento', label: 'Entrenamiento (pizarra y ejercicios)', module: 'entrenamiento', grupo: 'Deportivo' },
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
  // La sección manda: un plan puede llevar «Contabilidad» y dejar fuera
  // «Descuentos». Si no dice nada de ella, decide su módulo, y si tampoco
  // pertenece a ninguno (las de Configuración), está activada.
  const propia = features?.[section as CrmSectionId]
  if (typeof propia === 'boolean') return propia
  const module = SECTION_MODULE.get(String(section))
  if (!module) return true
  return isModuleEnabled(module, features)
}

/** Normaliza un objeto arbitrario (de la BD/red) a un TenantFeatures válido. */
export function sanitizeFeatures(input: unknown): TenantFeatures {
  const out: TenantFeatures = {}
  if (!input || typeof input !== 'object') return out
  const o = input as Record<string, unknown>
  for (const m of CRM_MODULES) {
    if (typeof o[m.id] === 'boolean') out[m.id] = o[m.id] as boolean
  }
  // Y las secciones. Sin esto, un plan que solo quita «Descuentos» se guardaba
  // vacío y el club se llevaba gratis lo que no había pagado.
  for (const s of CRM_SECTIONS) {
    if (typeof o[s.id] === 'boolean') out[s.id] = o[s.id] as boolean
  }
  return out
}

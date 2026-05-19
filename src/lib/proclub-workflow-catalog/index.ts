import { SPORT_TEMPLATES } from './templates-sport'
import { BILLING_TEMPLATES } from './templates-billing'
import { CAPTURE_TEMPLATES, SIGNUP_TEMPLATES, CHURN_TEMPLATES } from './templates-periphery'
import type { ProclubCatalogManifest, ProclubManifestEntry, ProclubWorkflowTemplate } from './types'

export const PROCLUB_CATALOG_VERSION = 1

export const PROCLUB_TEMPLATES: ProclubWorkflowTemplate[] = [
  ...SPORT_TEMPLATES,
  ...BILLING_TEMPLATES,
  ...CAPTURE_TEMPLATES,
  ...SIGNUP_TEMPLATES,
  ...CHURN_TEMPLATES,
]

function toManifestEntry(t: ProclubWorkflowTemplate): ProclubManifestEntry {
  return {
    proclubId: t.proclubId,
    name: t.name,
    proclubArea: t.proclubArea,
    proclubType: t.proclubType,
    implementationStatus: t.implementationStatus,
    phase: t.phase,
    triggerType: t.triggerType,
    notes: t.notes,
  }
}

export function getProclubManifest(): ProclubCatalogManifest {
  return {
    format: 'proclub-workflow-catalog',
    version: PROCLUB_CATALOG_VERSION,
    templateCount: PROCLUB_TEMPLATES.length,
    entries: PROCLUB_TEMPLATES.map(toManifestEntry),
  }
}

export function getProclubTemplate(proclubId: string): ProclubWorkflowTemplate | null {
  const id = proclubId.trim().toUpperCase()
  return PROCLUB_TEMPLATES.find((t) => t.proclubId === id) ?? null
}

export function listProclubTemplates(filters?: {
  area?: string
  status?: string
}): ProclubWorkflowTemplate[] {
  let list = [...PROCLUB_TEMPLATES]
  if (filters?.area) {
    list = list.filter((t) => t.proclubArea === filters.area)
  }
  if (filters?.status) {
    list = list.filter((t) => t.implementationStatus === filters.status)
  }
  return list
}

export function proclubIdFromTriggerConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null
  const id = (config as { proclubId?: string }).proclubId
  return typeof id === 'string' && id.trim() ? id.trim().toUpperCase() : null
}

export function proclubIdFromDescription(description: string | null | undefined): string | null {
  if (!description) return null
  const m = description.match(/\[PROCLUB:([A-Z]+-\d+)\]/i)
  return m?.[1]?.toUpperCase() ?? null
}

export type { ProclubWorkflowTemplate, ProclubCatalogManifest, ProclubManifestEntry } from './types'

export type ProclubArea = 'sport' | 'billing' | 'capture' | 'signup' | 'churn'
export type ProclubAutomationType = 'Auto' | 'Mixto' | 'Manual'
export type ProclubImplementationStatus = 'ready' | 'partial' | 'manual' | 'planned'

export type ProclubWorkflowStep = {
  position: number
  stepType: string
  actionType: string
  config: Record<string, unknown>
}

export type ProclubWorkflowTemplate = {
  proclubId: string
  proclubArea: ProclubArea
  proclubType: ProclubAutomationType
  implementationStatus: ProclubImplementationStatus
  phase: number
  notes: string
  name: string
  description: string
  triggerType: string
  /** Si false, la plantilla se instala pausada hasta completar motor/dominio. */
  defaultActive: boolean
  /** Solo ejecutar MEMBER_STATUS_CHANGED si el estado nuevo coincide (p. ej. INACTIVE). */
  onlyWhenCurrentStatus?: string
  /** Disparadores adicionales (p. ej. WD-1: MEMBER_CREATED + TEAM_ROSTER_CONFIRMED). */
  eventKinds?: string[]
  steps: ProclubWorkflowStep[]
}

export type ProclubManifestEntry = {
  proclubId: string
  name: string
  proclubArea: ProclubArea
  proclubType: ProclubAutomationType
  implementationStatus: ProclubImplementationStatus
  phase: number
  triggerType: string
  notes: string
}

export type ProclubCatalogManifest = {
  format: 'proclub-workflow-catalog'
  version: 1
  templateCount: number
  entries: ProclubManifestEntry[]
}

import { BILLING_PROCLUB_WORKFLOWS } from '@/lib/proclub-workflow-catalog/workflows-billing'
import { ENROLLMENT_PROCLUB_WORKFLOWS } from '@/lib/proclub-workflow-catalog/workflows-enrollment'
import { LEADS_PROCLUB_WORKFLOWS } from '@/lib/proclub-workflow-catalog/workflows-leads'
import { LEAVE_PROCLUB_WORKFLOWS } from '@/lib/proclub-workflow-catalog/workflows-leave'
import { SPORT_PROCLUB_WORKFLOWS } from '@/lib/proclub-workflow-catalog/workflows-sport'
import type { ProclubCatalogEntry } from '@/lib/proclub-workflow-catalog/types'

export * from '@/lib/proclub-workflow-catalog/types'
export * from '@/lib/proclub-workflow-catalog/install'

export const PROCLUB_CATALOG: ProclubCatalogEntry[] = [
  ...SPORT_PROCLUB_WORKFLOWS,
  ...BILLING_PROCLUB_WORKFLOWS,
  ...LEADS_PROCLUB_WORKFLOWS,
  ...ENROLLMENT_PROCLUB_WORKFLOWS,
  ...LEAVE_PROCLUB_WORKFLOWS,
]

export const PROCLUB_MANIFEST = PROCLUB_CATALOG.map((e) => ({
  catalogId: e.catalogId,
  name: e.workflow.name,
  area: e.area,
  automation: e.automation,
  phase: e.phase,
  triggerType: e.workflow.triggerType,
  stepCount: e.workflow.steps.length,
}))

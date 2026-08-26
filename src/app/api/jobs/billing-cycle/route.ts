import { NextResponse } from 'next/server'
import { runBillingCycleWorkflows } from '@/lib/workflow-proclub-runners'
import { requireCronAuth } from '@/lib/cron-auth'
import { forEachTenant } from '@/lib/multitenant/dispatch'

export const dynamic = 'force-dynamic'

/**
 * Cron de ciclo de facturación (workflows). Recorre TODOS los tenants con
 * forEachTenant para que las consultas Prisma tengan la BD del club activa.
 * Auth: Bearer CRON_SECRET.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const runs = await forEachTenant(() => runBillingCycleWorkflows())
  const failed = runs.filter((r) => !r.ok).map((r) => ({ tenant: r.slug, error: r.error }))
  return NextResponse.json({ ok: true, tenants: runs.length, failed })
}

export async function POST(request: Request) {
  return run(request)
}

export async function GET(request: Request) {
  return run(request)
}

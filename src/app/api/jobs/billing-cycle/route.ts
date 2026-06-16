import { NextResponse } from 'next/server'
import { runBillingCycleWorkflows } from '@/lib/workflow-proclub-runners'
import { requireCronAuth } from '@/lib/cron-auth'

export async function POST(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  await runBillingCycleWorkflows()
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { findEventsStartingSoon } from '@/lib/team-calendar'
import { runEventStartingSoonWorkflows } from '@/lib/workflow-engine'
import { requireCronAuth } from '@/lib/cron-auth'

export async function POST(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const events = await findEventsStartingSoon(90)
  let notified = 0
  for (const ev of events) {
    await runEventStartingSoonWorkflows(ev.id)
    notified++
  }

  return NextResponse.json({ ok: true, notified })
}

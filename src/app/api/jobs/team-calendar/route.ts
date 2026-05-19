import { NextResponse } from 'next/server'
import { findEventsStartingSoon } from '@/lib/team-calendar'
import { runEventStartingSoonWorkflows } from '@/lib/workflow-engine'

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET
  const auth = request.headers.get('authorization')
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const events = await findEventsStartingSoon(90)
  let notified = 0
  for (const ev of events) {
    await runEventStartingSoonWorkflows(ev.id)
    notified++
  }

  return NextResponse.json({ ok: true, notified })
}

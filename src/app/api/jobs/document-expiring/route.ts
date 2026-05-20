import { NextResponse } from 'next/server'
import { runDocumentExpiringWorkflows } from '@/lib/workflow-proclub-runners'

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET
  const auth = request.headers.get('authorization')
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  await runDocumentExpiringWorkflows()
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { runBulkMessageWorkflows } from '@/lib/workflow-proclub-runners'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  let body: { teamId?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const teamId = String(body.teamId || '').trim()
  const message = String(body.message || '').trim()
  if (!teamId || !message) {
    return NextResponse.json({ error: 'teamId y message son obligatorios' }, { status: 400 })
  }

  await runBulkMessageWorkflows(teamId, message)
  return NextResponse.json({ ok: true })
}

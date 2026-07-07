import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { runBulkMessageWorkflows } from '@/lib/workflow-proclub-runners'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  let body: { groupId?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const groupId = String(body.groupId || '').trim()
  const message = String(body.message || '').trim()
  if (!groupId || !message) {
    return NextResponse.json({ error: 'groupId y message son obligatorios' }, { status: 400 })
  }

  await runBulkMessageWorkflows(groupId, message)
  return NextResponse.json({ ok: true })
}

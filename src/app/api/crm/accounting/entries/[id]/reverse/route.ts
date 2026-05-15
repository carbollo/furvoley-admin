import { NextResponse } from 'next/server'
import { reverseJournalEntry } from '@/lib/accounting/engine'
import { requireRoles } from '@/lib/rbac-api'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response
  const { id } = await context.params
  let reason = 'Reversión manual'
  try {
    const body = await request.json()
    reason = String(body?.reason || reason)
  } catch {
    //
  }
  try {
    const reversed = await reverseJournalEntry(id, reason)
    return NextResponse.json({ ok: true, reversed })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'No se pudo revertir' }, { status: 400 })
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { reverseJournalEntry } from '@/lib/accounting/engine'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
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

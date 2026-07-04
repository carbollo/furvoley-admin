import { NextResponse } from 'next/server'
import { backfillLedgerFromTransactions } from '@/lib/accounting/backfill'
import { requireRoles } from '@/lib/rbac-api'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response
  try {
    const result = await backfillLedgerFromTransactions()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Backfill falló' }, { status: 400 })
  }
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { parseIsoDateParam } from '@/lib/db-input-validation'

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const fromRaw = parseIsoDateParam(url.searchParams.get('from'), 'from')
  if (fromRaw instanceof NextResponse) return fromRaw
  const toRaw = parseIsoDateParam(url.searchParams.get('to'), 'to')
  if (toRaw instanceof NextResponse) return toRaw

  const dateWhere: { gte?: Date; lte?: Date } = {}
  if (fromRaw) dateWhere.gte = fromRaw
  if (toRaw) dateWhere.lte = toRaw

  const lines = await prisma.journalLine.findMany({
    where: fromRaw || toRaw ? { entry: { entryDate: dateWhere } } : {},
    include: { account: true, entry: true },
  })

  const byAccount = new Map<string, { code: string; name: string; debit: number; credit: number; nature: string }>()
  for (const l of lines) {
    const key = l.account.code
    const row = byAccount.get(key) ?? {
      code: l.account.code,
      name: l.account.name,
      debit: 0,
      credit: 0,
      nature: l.account.nature,
    }
    if (l.side === 'DEBIT') row.debit += l.amount
    else row.credit += l.amount
    byAccount.set(key, row)
  }
  const trialBalance = Array.from(byAccount.values()).sort((a, b) => a.code.localeCompare(b.code))

  const pnl = trialBalance
    .filter((r) => r.nature === 'INCOME' || r.nature === 'EXPENSE')
    .map((r) => ({
      ...r,
      balance: r.nature === 'INCOME' ? r.credit - r.debit : r.debit - r.credit,
    }))

  const balanceSheet = {
    assets: trialBalance
      .filter((r) => r.nature === 'ASSET')
      .map((r) => ({ ...r, balance: r.debit - r.credit })),
    liabilities: trialBalance
      .filter((r) => r.nature === 'LIABILITY')
      .map((r) => ({ ...r, balance: r.credit - r.debit })),
    equity: trialBalance
      .filter((r) => r.nature === 'EQUITY')
      .map((r) => ({ ...r, balance: r.credit - r.debit })),
  }

  return NextResponse.json({
    trialBalance,
    pnl,
    balanceSheet,
    totals: {
      debit: trialBalance.reduce((a, r) => a + r.debit, 0),
      credit: trialBalance.reduce((a, r) => a + r.credit, 0),
    },
  })
}

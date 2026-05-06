import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const dateWhere: any = {}
  if (from) dateWhere.gte = new Date(from)
  if (to) dateWhere.lte = new Date(to)

  const lines = await prisma.journalLine.findMany({
    where: from || to ? { entry: { entryDate: dateWhere } } : {},
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

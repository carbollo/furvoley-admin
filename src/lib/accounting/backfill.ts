import { prisma } from '@/lib/prisma'
import { createJournalEntry } from '@/lib/accounting/engine'
import { ensureBasePgcAccounts } from '@/lib/accounting/pgc'

export async function backfillLedgerFromTransactions() {
  await ensureBasePgcAccounts()

  const existing = await prisma.journalEntry.count({
    where: { source: { in: ['PAYMENT', 'ADJUSTMENT'] } },
  })
  if (existing > 0) {
    return { created: 0, skipped: true }
  }

  const txs = await prisma.transaction.findMany({
    orderBy: { date: 'asc' },
    include: { invoice: true },
  })

  let created = 0
  for (const tx of txs) {
    const cashAccount = tx.source === 'CASH' ? '5700000' : '5720000'
    const counterAccount = tx.type === 'INCOME' ? '7000000' : '6290000'
    const isIncome = tx.type === 'INCOME'

    await createJournalEntry({
      concept: tx.description,
      entryDate: tx.date,
      reference: `TX:${tx.id}`,
      source: tx.source === 'MANUAL' ? 'ADJUSTMENT' : 'PAYMENT',
      sourceId: tx.id,
      lines: [
        {
          accountCode: cashAccount,
          side: isIncome ? 'DEBIT' : 'CREDIT',
          amount: tx.amount,
          lineConcept: tx.description,
        },
        {
          accountCode: counterAccount,
          side: isIncome ? 'CREDIT' : 'DEBIT',
          amount: tx.amount,
          lineConcept: tx.description,
        },
      ],
    })
    created++
  }

  return { created, skipped: false }
}

import { prisma } from '@/lib/prisma'
import { createJournalEntry } from '@/lib/accounting/engine'
import { ensureBasePgcAccounts } from '@/lib/accounting/pgc'

export async function backfillLedgerFromTransactions() {
  await ensureBasePgcAccounts()

  // La guarda anterior era «¿hay ya algún asiento de cobro o de ajuste?», y no
  // servía: un club que registra sus ingresos a mano tiene asientos con source
  // MANUAL, que no entraban en esa cuenta, así que el recorrido volvía a pasar
  // por TODOS los movimientos y les creaba un segundo asiento. Los gastos se
  // duplicaban en el libro.
  //
  // Ahora se salta movimiento a movimiento, y por la REFERENCIA, que es la
  // única clave estable: los asientos de cobro guardan en `sourceId` el id de
  // la FACTURA, no el del movimiento, así que buscar por sourceId tampoco
  // habría funcionado.
  const txs = await prisma.transaction.findMany({
    orderBy: { date: 'asc' },
    include: { invoice: true },
  })

  const yaAsentados = new Set(
    (
      await prisma.journalEntry.findMany({
        where: { reference: { startsWith: 'TX:' } },
        select: { reference: true },
      })
    )
      .map((e) => (e.reference || '').slice(3))
      .filter(Boolean),
  )

  // Y los cobros de factura, que se asientan por su cuenta desde billing.ts con
  // el id de la factura como origen: si el movimiento apunta a una factura que
  // ya tiene su asiento de cobro, no se vuelve a asentar.
  const facturasConCobro = new Set(
    (
      await prisma.journalEntry.findMany({
        where: { source: 'PAYMENT' },
        select: { sourceId: true },
      })
    )
      .map((e) => e.sourceId || '')
      .filter(Boolean),
  )

  let created = 0
  let skipped = 0
  for (const tx of txs) {
    if (yaAsentados.has(tx.id)) {
      skipped++
      continue
    }
    if (tx.invoiceId && facturasConCobro.has(tx.invoiceId)) {
      skipped++
      continue
    }
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

  return { created, skipped, omitidos: skipped }
}

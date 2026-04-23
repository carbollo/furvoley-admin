'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { parseBankCsvContent } from '@/lib/bank-csv'

export async function importBankCsv(data: {
  content: string
  fileName?: string | null
  note?: string | null
  delimiter?: ';' | ',' | 'auto'
}) {
  const parsed = parseBankCsvContent(data.content, { delimiter: data.delimiter ?? 'auto' })
  if (parsed.rows.length === 0) {
    return { success: false as const, error: parsed.warnings.join(' ') || 'Sin filas válidas' }
  }

  const batch = await prisma.bankImport.create({
    data: {
      fileName: data.fileName ?? null,
      note: data.note ?? null,
      rowCount: parsed.rows.length,
      lines: {
        create: parsed.rows.map((r, idx) => ({
          rowIndex: idx,
          date: r.date,
          signedAmount: r.signedAmount,
          description: r.description,
          reference: r.reference,
          status: 'PENDING',
        })),
      },
    },
  })

  revalidatePath('/accounting/bank-import')
  revalidatePath(`/accounting/bank-import/${batch.id}`)
  revalidatePath('/accounting')
  return {
    success: true as const,
    id: batch.id,
    imported: parsed.rows.length,
    warnings: parsed.warnings,
  }
}

export async function getBankImports() {
  return prisma.bankImport.findMany({
    orderBy: { importedAt: 'desc' },
    include: {
      _count: { select: { lines: true } },
    },
  })
}

export async function getBankImportDetail(id: string) {
  return prisma.bankImport.findUnique({
    where: { id },
    include: {
      lines: {
        orderBy: { rowIndex: 'asc' },
        include: {
          matchedTransaction: {
            include: { invoice: { select: { invoiceNumber: true } } },
          },
        },
      },
    },
  })
}

function amountMatch(a: number, b: number) {
  return Math.abs(a - b) < 0.02
}

export async function getSuggestedTransactionsForLine(lineId: string) {
  const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } })
  if (!line) return []

  const abs = Math.abs(line.signedAmount)
  const type = line.signedAmount >= 0 ? 'INCOME' : 'EXPENSE'
  const start = new Date(line.date)
  start.setDate(start.getDate() - 10)
  const end = new Date(line.date)
  end.setDate(end.getDate() + 10)

  const already = await prisma.bankStatementLine.findMany({
    where: {
      matchedTransactionId: { not: null },
      NOT: { id: lineId },
    },
    select: { matchedTransactionId: true },
  })
  const usedIds = already.map((x) => x.matchedTransactionId!).filter(Boolean)

  const candidates = await prisma.transaction.findMany({
    where: {
      type,
      amount: { gte: abs - 0.02, lte: abs + 0.02 },
      date: { gte: start, lte: end },
      ...(usedIds.length ? { id: { notIn: usedIds } } : {}),
    },
    orderBy: { date: 'desc' },
    take: 15,
    include: { invoice: { select: { invoiceNumber: true } } },
  })

  return candidates
}

export async function reconcileBankLine(lineId: string, transactionId: string) {
  const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } })
  const tx = await prisma.transaction.findUnique({ where: { id: transactionId } })
  if (!line || !tx) throw new Error('Línea o asiento no encontrado')

  const absLine = Math.abs(line.signedAmount)
  if (!amountMatch(absLine, tx.amount)) throw new Error('El importe no coincide con el asiento')
  const expectIncome = line.signedAmount >= 0
  if ((expectIncome && tx.type !== 'INCOME') || (!expectIncome && tx.type !== 'EXPENSE')) {
    throw new Error('El tipo de movimiento (ingreso/gasto) no encaja')
  }

  await prisma.bankStatementLine.update({
    where: { id: lineId },
    data: {
      status: 'MATCHED',
      matchedTransactionId: transactionId,
    },
  })

  if (line.reference && !tx.bankReference) {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { bankReference: line.reference },
    })
  }

  revalidatePath('/accounting/bank-import')
  revalidatePath(`/accounting/bank-import/${line.bankImportId}`)
  revalidatePath('/accounting')
  return { ok: true }
}

export async function ignoreBankLine(lineId: string) {
  const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } })
  if (!line) throw new Error('Línea no encontrada')

  await prisma.bankStatementLine.update({
    where: { id: lineId },
    data: { status: 'IGNORED', matchedTransactionId: null },
  })

  revalidatePath(`/accounting/bank-import/${line.bankImportId}`)
  revalidatePath('/accounting/bank-import')
}

export async function unlinkBankLine(lineId: string) {
  const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } })
  if (!line) throw new Error('Línea no encontrada')

  await prisma.bankStatementLine.update({
    where: { id: lineId },
    data: { status: 'PENDING', matchedTransactionId: null },
  })

  revalidatePath(`/accounting/bank-import/${line.bankImportId}`)
  revalidatePath('/accounting/bank-import')
}

export async function createLedgerFromBankLine(lineId: string) {
  const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } })
  if (!line) throw new Error('Línea no encontrada')
  if (line.status === 'MATCHED') throw new Error('La línea ya está conciliada')

  const abs = Math.abs(line.signedAmount)
  const type = line.signedAmount >= 0 ? 'INCOME' : 'EXPENSE'
  const desc =
    line.description.length > 200 ? line.description.slice(0, 197) + '…' : line.description

  const tx = await prisma.transaction.create({
    data: {
      type,
      amount: abs,
      description: `Banco: ${desc}`,
      date: line.date,
      bankReference: line.reference,
      source: 'BANK_CSV_IMPORT',
    },
  })

  await prisma.bankStatementLine.update({
    where: { id: lineId },
    data: {
      status: 'NEW_LEDGER',
      matchedTransactionId: tx.id,
    },
  })

  revalidatePath(`/accounting/bank-import/${line.bankImportId}`)
  revalidatePath('/accounting/bank-import')
  revalidatePath('/accounting')
  return tx.id
}

export async function deleteBankImport(id: string) {
  await prisma.bankImport.delete({ where: { id } })
  revalidatePath('/accounting/bank-import')
  revalidatePath('/accounting')
}

export async function deleteBankImportFromForm(formData: FormData) {
  const id = String(formData.get('batchId') || '')
  if (!id) return
  await deleteBankImport(id)
}

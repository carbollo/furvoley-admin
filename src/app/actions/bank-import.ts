'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { normalizeRole } from '@/lib/rbac'
import { runWithTenant } from '@/lib/multitenant/request'
import { parseBankCsvContent, previewBankCsvContent, type BankCsvColumnas } from '@/lib/bank-csv'
import { recordManualInvoicePayment } from '@/app/actions/billing'

/**
 * Server actions de conciliación bancaria (los invocan componentes cliente y RSC de
 * /accounting/bank-import, y una form action). Son endpoints RPC, así que cada uno
 * exige rol ADMIN/TREASURER y se ejecuta en runWithTenant (activa la BD del club por
 * host). Antes ninguno comprobaba auth: un usuario autenticado cualquiera podía
 * importar/borrar extractos, crear/borrar asientos o conciliar líneas.
 */
async function assertAccountingStaff() {
  const session = await getServerSession(authOptions)
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role)
  if (!session?.user || (role !== 'ADMIN' && role !== 'TREASURER')) {
    throw new Error('No autorizado')
  }
}

/**
 * Huella de una fila del extracto: fecha + importe + concepto normalizado.
 *
 * Es lo que permite detectar que el club ha vuelto a subir el mismo extracto (o
 * un extracto solapado, que es lo normal al pedir «los últimos 60 días» cada
 * mes). Sin ella, cada resubida duplicaba los ingresos del club.
 */
function huellaFila(
  r: { date: Date; signedAmount: number; description: string },
  repeticion: number,
): string {
  const dia = r.date.toISOString().slice(0, 10)
  const importe = r.signedAmount.toFixed(2)
  const concepto = r.description
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  // `repeticion` distingue dos movimientos REALES idénticos el mismo día (dos
  // familias que pagan 30 € con el mismo concepto). Sin él, el segundo se
  // descartaría como duplicado y el club perdería ese ingreso. Al reimportar el
  // mismo extracto las repeticiones vuelven a numerarse igual, así que la
  // deduplicación sigue funcionando.
  return `${dia}|${importe}|${concepto}|${repeticion}`
}

/** Lee el fichero sin importar nada, para enseñar qué columna ha entendido cada cosa. */
export async function previewBankCsv(data: { content: string; delimiter?: ';' | ',' | 'auto' }) {
  return runWithTenant(async () => {
    await assertAccountingStaff()
    return previewBankCsvContent(data.content, { delimiter: data.delimiter ?? 'auto' })
  })
}

export async function importBankCsv(data: {
  content: string
  fileName?: string | null
  note?: string | null
  delimiter?: ';' | ',' | 'auto'
  /** Columnas confirmadas por el usuario en la previsualización. */
  columnas?: BankCsvColumnas
  saltarCabecera?: boolean
}) {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  const parsed = parseBankCsvContent(data.content, {
    delimiter: data.delimiter ?? 'auto',
    columnas: data.columnas,
    saltarCabecera: data.saltarCabecera,
  })
  if (parsed.rows.length === 0) {
    return { success: false as const, error: parsed.warnings.join(' ') || 'Sin filas válidas' }
  }

  // Se descartan de entrada las filas que ya están en algún extracto anterior.
  // Dentro del propio fichero también puede haber repetidas, así que se filtra
  // en los dos sentidos antes de tocar la BD.
  const repeticiones = new Map<string, number>()
  const conHuella = parsed.rows.map((r) => {
    const base = huellaFila(r, 0).slice(0, -2)
    const n = repeticiones.get(base) ?? 0
    repeticiones.set(base, n + 1)
    return { ...r, fingerprint: huellaFila(r, n) }
  })
  const yaEnBd = new Set(
    (
      await prisma.bankStatementLine.findMany({
        where: { fingerprint: { in: conHuella.map((r) => r.fingerprint) } },
        select: { fingerprint: true },
      })
    ).map((l) => l.fingerprint as string),
  )
  const nuevas = conHuella.filter((r) => !yaEnBd.has(r.fingerprint))
  const duplicadas = conHuella.length - nuevas.length

  const avisos = [...parsed.warnings]
  if (duplicadas > 0) {
    avisos.push(
      duplicadas === conHuella.length
        ? 'Todas las filas de este extracto ya estaban importadas: no se ha añadido ninguna.'
        : `${duplicadas} fila(s) ya estaban en un extracto anterior y no se han vuelto a importar.`,
    )
  }

  if (nuevas.length === 0) {
    return {
      success: false as const,
      error:
        'Este extracto ya estaba importado entero. No se ha añadido nada para no duplicar los ingresos.',
    }
  }

  const batch = await prisma.bankImport.create({
    data: {
      fileName: data.fileName ?? null,
      note: data.note ?? null,
      rowCount: nuevas.length,
      warnings: avisos,
      duplicateCount: duplicadas,
      lines: {
        create: nuevas.map((r, idx) => ({
          rowIndex: idx,
          date: r.date,
          signedAmount: r.signedAmount,
          description: r.description,
          reference: r.reference,
          fingerprint: r.fingerprint,
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
    imported: nuevas.length,
    duplicates: duplicadas,
    warnings: avisos,
  }
  })
}

export async function getBankImports() {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  const batches = await prisma.bankImport.findMany({
    orderBy: { importedAt: 'desc' },
    include: {
      _count: { select: { lines: true } },
      // Solo el estado de cada línea: basta para el avance y evita traerse el
      // extracto entero a la lista.
      lines: { select: { status: true } },
    },
  })
  return batches.map((b) => {
    const total = b.lines.length
    const pendientes = b.lines.filter((l) => l.status === 'PENDING').length
    return {
      ...b,
      lines: undefined,
      pendientes,
      revisadas: total - pendientes,
      progreso: total > 0 ? Math.round(((total - pendientes) / total) * 100) : 100,
    }
  })
  })
}

export async function getBankImportDetail(id: string) {
  return runWithTenant(async () => {
  await assertAccountingStaff()
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
  })
}

function amountMatch(a: number, b: number) {
  return Math.abs(a - b) < 0.02
}

export async function getSuggestedTransactionsForLine(lineId: string) {
  return runWithTenant(async () => {
  await assertAccountingStaff()
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
  })
}

export type BankLineResult = { ok: true } | { ok: false; error: string }

export async function reconcileBankLine(
  lineId: string,
  transactionId: string,
): Promise<BankLineResult> {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } })
  const tx = await prisma.transaction.findUnique({ where: { id: transactionId } })
  if (!line || !tx) return { ok: false as const, error: 'Esa línea o ese movimiento ya no existen. Recarga la página.' }

  const absLine = Math.abs(line.signedAmount)
  if (!amountMatch(absLine, tx.amount)) {
    return { ok: false as const, error: 'El importe del movimiento no coincide con el de la línea del banco.' }
  }
  const expectIncome = line.signedAmount >= 0
  if ((expectIncome && tx.type !== 'INCOME') || (!expectIncome && tx.type !== 'EXPENSE')) {
    return {
      ok: false as const,
      error: expectIncome
        ? 'Esta línea es un ingreso y el movimiento elegido es un gasto.'
        : 'Esta línea es un gasto y el movimiento elegido es un ingreso.',
    }
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
  return { ok: true as const }
  })
}

export async function ignoreBankLine(lineId: string): Promise<BankLineResult> {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } })
  if (!line) return { ok: false as const, error: 'Esa línea ya no existe. Recarga la página.' }

  await prisma.bankStatementLine.update({
    where: { id: lineId },
    data: { status: 'IGNORED', matchedTransactionId: null },
  })

  revalidatePath(`/accounting/bank-import/${line.bankImportId}`)
  revalidatePath('/accounting/bank-import')
  return { ok: true as const }
  })
}

export async function unlinkBankLine(lineId: string): Promise<BankLineResult> {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } })
  if (!line) return { ok: false as const, error: 'Esa línea ya no existe. Recarga la página.' }

  await prisma.bankStatementLine.update({
    where: { id: lineId },
    data: { status: 'PENDING', matchedTransactionId: null },
  })

  revalidatePath(`/accounting/bank-import/${line.bankImportId}`)
  revalidatePath('/accounting/bank-import')
  return { ok: true as const }
  })
}

export async function createLedgerFromBankLine(lineId: string): Promise<BankLineResult> {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } })
  if (!line) return { ok: false as const, error: 'Esa línea ya no existe. Recarga la página.' }
  if (line.status === 'MATCHED') {
    return { ok: false as const, error: 'Esta línea ya está conciliada con un movimiento.' }
  }
  if (line.status === 'NEW_LEDGER' && line.matchedTransactionId) {
    return { ok: false as const, error: 'Esta línea ya generó su movimiento. No se crea otro para no duplicar el importe.' }
  }

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
  return { ok: true as const }
  })
}

export async function deleteBankImport(id: string) {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  await prisma.bankImport.delete({ where: { id } })
  revalidatePath('/accounting/bank-import')
  revalidatePath('/accounting')
  })
}

export async function deleteBankImportFromForm(formData: FormData) {
  return runWithTenant(async () => {
  await assertAccountingStaff()
  const id = String(formData.get('batchId') || '')
  if (!id) return
  await prisma.bankImport.delete({ where: { id } })
  revalidatePath('/accounting/bank-import')
  revalidatePath('/accounting')
  })
}

/**
 * Facturas abiertas que encajan con una línea de ingreso del extracto.
 *
 * Se ordenan por cercanía de importe: lo que el tesorero busca casi siempre es
 * «esta transferencia de 45 € es la cuota de alguien».
 */
export async function getInvoiceCandidatesForLine(lineId: string) {
  return runWithTenant(async () => {
    await assertAccountingStaff()
    const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } })
    if (!line || line.signedAmount <= 0) return []

    const abs = Math.abs(line.signedAmount)
    const abiertas = await prisma.invoice.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      include: { member: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 200,
    })

    return abiertas
      .map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        memberName: inv.member.name,
        pendingAmount: Math.max(0, inv.totalAmount - inv.paidAmount),
        dueDate: inv.dueDate.toISOString(),
      }))
      .filter((inv) => inv.pendingAmount > 0)
      .sort((a, b) => Math.abs(a.pendingAmount - abs) - Math.abs(b.pendingAmount - abs))
      .slice(0, 12)
  })
}

/**
 * Salda una factura con el dinero de una línea del extracto.
 *
 * Es la acción por la que existe esta pantalla y era justo la que faltaba:
 * «conciliar» solo emparejaba la línea con un movimiento ya existente, así que
 * el socio seguía debiendo y en Impagos. Aquí el cobro se registra de verdad
 * (lo que activa al socio y dispara sus flujos) y la línea queda enganchada al
 * `Transaction` que ese cobro genera, de modo que no se pueda volver a cobrar.
 */
export async function payInvoiceFromBankLine(
  lineId: string,
  invoiceId: string,
): Promise<BankLineResult> {
  return runWithTenant(async () => {
    await assertAccountingStaff()
    const line = await prisma.bankStatementLine.findUnique({ where: { id: lineId } })
    if (!line) return { ok: false as const, error: 'Esa línea ya no existe. Recarga la página.' }
    if (line.status !== 'PENDING') {
      return { ok: false as const, error: 'Esta línea ya está conciliada. Desvincúlala primero si quieres rehacerla.' }
    }
    if (line.signedAmount <= 0) {
      return { ok: false as const, error: 'Esta línea es un cargo, no un ingreso: no puede pagar una factura.' }
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
    if (!invoice) return { ok: false as const, error: 'Esa factura ya no existe.' }

    const pendiente = Math.max(0, invoice.totalAmount - invoice.paidAmount)
    if (pendiente <= 0) {
      return { ok: false as const, error: `La factura ${invoice.invoiceNumber} ya está pagada.` }
    }

    // Nunca se cobra más de lo que se debe ni más de lo que entró por banco: si
    // la transferencia es mayor, el resto se queda sin conciliar a la vista.
    const importe = Math.min(pendiente, line.signedAmount)

    await recordManualInvoicePayment({
      invoiceId,
      amount: importe,
      method: 'BANK_TRANSFER',
      bankReference: line.reference || line.description.slice(0, 120),
    })

    // El cobro crea su propio Transaction con invoiceId; se engancha la línea a
    // él para que quede conciliada y no se pueda cobrar dos veces.
    const tx = await prisma.transaction.findFirst({
      where: { invoiceId, type: 'INCOME' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })

    await prisma.bankStatementLine.update({
      where: { id: lineId },
      data: {
        status: 'MATCHED',
        matchedTransactionId: tx?.id ?? null,
      },
    })

    revalidatePath(`/accounting/bank-import/${line.bankImportId}`)
    revalidatePath('/accounting/bank-import')
    revalidatePath('/accounting')
    revalidatePath('/')
    return { ok: true as const }
  })
}

import { prisma } from '@/lib/prisma'

type JournalLineInput = {
  accountCode: string
  side: 'DEBIT' | 'CREDIT'
  amount: number
  lineConcept?: string
  memberId?: string | null
  costCenter?: string | null
}

type CreateEntryInput = {
  concept: string
  entryDate?: Date
  reference?: string
  source?: string
  sourceId?: string
  lines: JournalLineInput[]
}

function ymd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function sum(lines: JournalLineInput[], side: 'DEBIT' | 'CREDIT') {
  return lines
    .filter((l) => l.side === side)
    .reduce((a, l) => a + Number(l.amount || 0), 0)
}

export async function ensureFiscalPeriod(date: Date) {
  const code = ymd(date)
  const startsAt = new Date(date.getFullYear(), date.getMonth(), 1)
  const endsAt = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
  return prisma.fiscalPeriod.upsert({
    where: { code },
    create: { code, startsAt, endsAt, isClosed: false },
    update: {},
  })
}

function isP2002(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

/**
 * Secuencia máxima de asiento del año (0 si no hay). Se deriva de max(entryNumber),
 * NO de count(): borrar un asiento intermedio no debe hacer que el siguiente número
 * colisione con uno ya usado (que rompería toda la contabilidad posterior). Formato
 * `A-YYYY-NNNNNN` de ancho fijo ⇒ orden lexicográfico == numérico.
 */
async function entryBaseSeq(prefix: string): Promise<number> {
  const last = await prisma.journalEntry.findFirst({
    where: { entryNumber: { startsWith: prefix } },
    orderBy: { entryNumber: 'desc' },
    select: { entryNumber: true },
  })
  if (!last) return 0
  const n = parseInt(last.entryNumber.slice(prefix.length), 10)
  return Number.isFinite(n) ? n : 0
}

async function nextEntryNumber(date: Date) {
  const prefix = `A-${date.getFullYear()}-`
  return `${prefix}${String((await entryBaseSeq(prefix)) + 1).padStart(6, '0')}`
}

export async function createJournalEntry(input: CreateEntryInput) {
  const entryDate = input.entryDate ?? new Date()
  if (!input.lines.length) throw new Error('El asiento requiere líneas')
  // Allowlist estricta de `side`: un valor fuera de DEBIT/CREDIT sería ignorado por
  // sum() y colaría un asiento descuadrado (línea que no cuenta) corrompiendo el
  // libro y los informes. Se rechaza aquí (única puerta para todos los llamadores).
  for (const l of input.lines) {
    if (l.side !== 'DEBIT' && l.side !== 'CREDIT') {
      throw new Error(`Lado de asiento inválido: "${l.side}". Debe ser DEBIT o CREDIT.`)
    }
  }
  const debit = sum(input.lines, 'DEBIT')
  const credit = sum(input.lines, 'CREDIT')
  if (debit <= 0 || credit <= 0) throw new Error('Debe y Haber deben ser mayores que 0')
  if (Math.abs(debit - credit) > 0.0001) throw new Error('El asiento no cuadra: Debe y Haber no coinciden')

  const period = await ensureFiscalPeriod(entryDate)
  if (period.isClosed) throw new Error('No se puede contabilizar en un periodo cerrado')

  const codes = Array.from(new Set(input.lines.map((l) => l.accountCode)))
  const accounts = await prisma.accountChart.findMany({ where: { code: { in: codes }, isActive: true } })
  const byCode = new Map(accounts.map((a) => [a.code, a]))
  for (const code of codes) {
    if (!byCode.has(code)) throw new Error(`Cuenta contable inexistente o inactiva: ${code}`)
  }

  const data = {
    concept: input.concept,
    entryDate,
    reference: input.reference,
    status: 'POSTED',
    source: input.source ?? 'MANUAL',
    sourceId: input.sourceId,
    fiscalPeriodId: period.id,
    lines: {
      create: input.lines.map((l) => ({
        side: l.side,
        amount: Number(l.amount),
        lineConcept: l.lineConcept ?? null,
        memberId: l.memberId ?? null,
        costCenter: l.costCenter ?? null,
        accountId: byCode.get(l.accountCode)!.id,
      })),
    },
  }
  const include = {
    lines: { include: { account: true } },
    fiscalPeriod: true,
  }
  // Número desde max(num)+1 con reintento ante colisión de unicidad (concurrencia).
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.journalEntry.create({
        data: { entryNumber: await nextEntryNumber(entryDate), ...data },
        include,
      })
    } catch (e) {
      lastErr = e
      if (isP2002(e)) continue
      throw e
    }
  }
  throw lastErr
}

export async function reverseJournalEntry(entryId: string, reason = 'Reversión') {
  const entry = await prisma.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: { include: { account: true } } },
  })
  if (!entry) throw new Error('Asiento no encontrado')
  if (entry.status !== 'POSTED') throw new Error('Solo se pueden revertir asientos contabilizados')

  const rev = await createJournalEntry({
    concept: `REVERSIÓN: ${entry.concept} (${reason})`,
    entryDate: new Date(),
    source: 'SYSTEM',
    sourceId: entry.id,
    lines: entry.lines.map((l) => ({
      accountCode: l.account.code,
      side: l.side === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      amount: l.amount,
      lineConcept: l.lineConcept ?? undefined,
      memberId: l.memberId,
      costCenter: l.costCenter,
    })),
  })

  await prisma.journalEntry.update({
    where: { id: entry.id },
    data: { status: 'REVERSED', reversalOfId: rev.id },
  })
  return rev
}

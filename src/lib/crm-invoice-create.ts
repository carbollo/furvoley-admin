import { prisma } from '@/lib/prisma'
import { postInvoiceAccrualSafe } from '@/lib/accounting/invoice-accrual'
import { getTaxConfig } from '@/lib/tax-config'
import { runInvoiceCreatedWorkflows } from '@/lib/workflow-engine'

export type InvoiceCreateInput = {
  concepto: string
  amount: number
  dueDate: string
  applyTax?: boolean
  taxRate?: number
  applyWithholding?: boolean
  withholdingRate?: number
}

export type InvoicePayload = {
  concepto: string
  amount: number
  dueDate: Date
  applyTax: boolean
  taxRate: number
  applyWithholding: boolean
  withholdingRate: number
  taxAmount: number
  withholdingAmount: number
  totalAmount: number
  status: string
}

export async function invoiceCountForYear(year = new Date().getFullYear()) {
  const prefix = `FV-${year}-`
  return prisma.invoice.count({
    where: { invoiceNumber: { startsWith: prefix } },
  })
}

/**
 * Secuencia MÁXIMA usada este año (0 si no hay ninguna). Se deriva del máximo
 * `invoiceNumber` existente, NO de count(): así, tras borrar una factura
 * intermedia, el siguiente número no colisiona con uno ya usado (count() sí lo
 * haría y rompería la facturación de forma permanente). El formato
 * `FV-YYYY-NNNNN` con ancho fijo hace que el orden lexicográfico == numérico.
 */
export async function invoiceBaseSeqForYear(year = new Date().getFullYear()): Promise<number> {
  const prefix = `FV-${year}-`
  const last = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  })
  if (!last) return 0
  const n = parseInt(last.invoiceNumber.slice(prefix.length), 10)
  return Number.isFinite(n) ? n : 0
}

export async function nextInvoiceNumber() {
  const year = new Date().getFullYear()
  const prefix = `FV-${year}-`
  return `${prefix}${String((await invoiceBaseSeqForYear(year)) + 1).padStart(5, '0')}`
}

export function invoiceNumberAtOffset(baseSeq: number, offset: number, year = new Date().getFullYear()) {
  const prefix = `FV-${year}-`
  return `${prefix}${String(baseSeq + offset + 1).padStart(5, '0')}`
}

/** ¿Es una violación de restricción única de Prisma (P2002)? */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

/**
 * Crea una factura asignando el número correlativo de forma robusta: lo deriva de
 * max(num)+1 y REINTENTA si dos altas concurrentes chocan en el `@unique`
 * `invoiceNumber` (P2002). `build(invoiceNumber)` devuelve los args de create.
 */
export async function createInvoiceWithNumber(
  build: (invoiceNumber: string) => Parameters<typeof prisma.invoice.create>[0],
  retries = 5,
) {
  let lastErr: unknown
  for (let attempt = 0; attempt < retries; attempt++) {
    const invoiceNumber = await nextInvoiceNumber()
    try {
      return await prisma.invoice.create(build(invoiceNumber))
    } catch (e) {
      lastErr = e
      if (isUniqueViolation(e)) continue
      throw e
    }
  }
  throw lastErr
}

export async function buildInvoicePayload(input: InvoiceCreateInput): Promise<InvoicePayload> {
  const concepto = String(input.concepto || '').trim()
  const amount = Number(input.amount)
  const dueDateRaw = String(input.dueDate || '').trim()

  if (!concepto || !Number.isFinite(amount) || amount <= 0 || !dueDateRaw) {
    throw new Error('Datos incompletos o inválidos')
  }

  const dueDate = new Date(dueDateRaw)
  if (Number.isNaN(dueDate.getTime())) {
    throw new Error('Fecha de vencimiento inválida')
  }

  const taxConfig = await getTaxConfig()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const status = dueDate < today ? 'OVERDUE' : 'PENDING'
  const applyTax = typeof input.applyTax === 'boolean' ? input.applyTax : taxConfig.applyOnInvoices
  const applyWithholding =
    typeof input.applyWithholding === 'boolean'
      ? input.applyWithholding
      : taxConfig.applyWithholdOnInvoices
  const taxRateInput = Number(input.taxRate)
  const withholdingRateInput = Number(input.withholdingRate)
  // Tipos acotados a [0, 100]: sin tope superior un taxRate enorme inflaba el total
  // y una retención > 100 dejaba el total NEGATIVO (factura con total < 0 persistida).
  const clampRate = (v: number, fallback: number) =>
    Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback
  const taxRate = clampRate(taxRateInput, taxConfig.vatRateIncome)
  const withholdingRate = clampRate(withholdingRateInput, taxConfig.withholdRateIncome)
  const taxAmount = applyTax ? Number((amount * (taxRate / 100)).toFixed(2)) : 0
  const withholdingAmount = applyWithholding
    ? Number((amount * (withholdingRate / 100)).toFixed(2))
    : 0
  const totalAmount = Number((amount + taxAmount - withholdingAmount).toFixed(2))
  if (totalAmount < 0) {
    throw new Error('El total de la factura no puede ser negativo. Revisa el importe, el IVA y la retención.')
  }

  return {
    concepto,
    amount,
    dueDate,
    applyTax,
    taxRate,
    applyWithholding,
    withholdingRate,
    taxAmount,
    withholdingAmount,
    totalAmount,
    status,
  }
}

export async function createMemberInvoice(memberId: string, input: InvoiceCreateInput) {
  const payload = await buildInvoicePayload(input)
  const invoice = await createInvoiceWithNumber((invoiceNumber) => ({
    data: {
      invoiceNumber,
      kind: 'OTHER',
      issueDate: new Date(),
      dueDate: payload.dueDate,
      subtotal: payload.amount,
      taxAmount: payload.taxAmount,
      // Guardada, no deducida por resta: hace falta para asentar el devengo y
      // evita que cualquier descuadre se convierta en una «retención» fantasma.
      withholdingAmount: payload.withholdingAmount,
      totalAmount: payload.totalAmount,
      paidAmount: 0,
      currency: 'EUR',
      status: payload.status,
      memberId,
      items: {
        create: [
          {
            description: payload.concepto,
            quantity: 1,
            unitAmount: payload.amount,
            totalAmount: payload.amount,
          },
        ],
      },
    },
    select: { id: true },
  }))

  void runInvoiceCreatedWorkflows(invoice.id).catch((e) =>
    console.warn('[crm-invoices] workflow', e),
  )

  // El asiento de emisión (devengo). Sin él la cuenta de Clientes solo se
  // abonaba al cobrar y nunca se cargaba, así que el balance la dejaba en
  // negativo y las cuotas no aparecían en el resultado del año.
  await postInvoiceAccrualSafe(invoice.id)

  return invoice
}

export async function createTeamInvoices(groupId: string, input: InvoiceCreateInput) {
  const payload = await buildInvoicePayload(input)
  const team = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true },
  })
  if (!team) throw new Error('Equipo no encontrado')

  const players = await prisma.groupMembership.findMany({
    where: { groupId, role: 'PLAYER' },
    select: { memberId: true },
  })
  const memberIds = [...new Set(players.map((p) => p.memberId))]
  if (!memberIds.length) throw new Error('El equipo no tiene jugadores a los que facturar')

  const year = new Date().getFullYear()
  const issueDate = new Date()

  // El lote se numera desde max(num)+1 (no count()) y se reintenta completo si
  // choca con el `@unique` por altas concurrentes.
  const runBatch = async () => {
    const baseSeq = await invoiceBaseSeqForYear(year)
    return prisma.$transaction(
      memberIds.map((memberId, index) =>
        prisma.invoice.create({
          data: {
            invoiceNumber: invoiceNumberAtOffset(baseSeq, index, year),
            kind: 'OTHER',
            issueDate,
            dueDate: payload.dueDate,
            subtotal: payload.amount,
            taxAmount: payload.taxAmount,
            totalAmount: payload.totalAmount,
            paidAmount: 0,
            currency: 'EUR',
            status: payload.status,
            memberId,
            items: {
              create: [
                {
                  description: payload.concepto,
                  quantity: 1,
                  unitAmount: payload.amount,
                  totalAmount: payload.amount,
                },
              ],
            },
          },
          select: { id: true, memberId: true },
        }),
      ),
    )
  }
  let invoices: { id: string; memberId: string }[] | undefined
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      invoices = await runBatch()
      break
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 4) continue
      throw e
    }
  }
  if (!invoices) throw new Error('No se pudieron generar las facturas del equipo')

  for (const invoice of invoices) {
    void runInvoiceCreatedWorkflows(invoice.id).catch((e) =>
      console.warn('[crm-invoices] workflow', e),
    )
  }

  return { teamName: team.name, count: invoices.length, ids: invoices.map((i) => i.id) }
}

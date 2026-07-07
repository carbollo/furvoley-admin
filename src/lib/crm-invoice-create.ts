import { prisma } from '@/lib/prisma'
import { getTaxConfig } from '@/lib/tax-config'
import { ensureMemberStripeCustomer } from '@/lib/stripe-member-customer'
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

export async function nextInvoiceNumber() {
  const year = new Date().getFullYear()
  const prefix = `FV-${year}-`
  const count = await invoiceCountForYear(year)
  return `${prefix}${String(count + 1).padStart(5, '0')}`
}

export function invoiceNumberAtOffset(baseCount: number, offset: number, year = new Date().getFullYear()) {
  const prefix = `FV-${year}-`
  return `${prefix}${String(baseCount + offset + 1).padStart(5, '0')}`
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
  const taxRate = Number.isFinite(taxRateInput) ? Math.max(0, taxRateInput) : taxConfig.vatRateIncome
  const withholdingRate = Number.isFinite(withholdingRateInput)
    ? Math.max(0, withholdingRateInput)
    : taxConfig.withholdRateIncome
  const taxAmount = applyTax ? Number((amount * (taxRate / 100)).toFixed(2)) : 0
  const withholdingAmount = applyWithholding
    ? Number((amount * (withholdingRate / 100)).toFixed(2))
    : 0
  const totalAmount = Number((amount + taxAmount - withholdingAmount).toFixed(2))

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
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: await nextInvoiceNumber(),
      kind: 'OTHER',
      issueDate: new Date(),
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
    select: { id: true },
  })

  void ensureMemberStripeCustomer(memberId).catch(() => {})
  void runInvoiceCreatedWorkflows(invoice.id).catch((e) =>
    console.warn('[crm-invoices] workflow', e),
  )

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
  const baseCount = await invoiceCountForYear(year)
  const issueDate = new Date()

  const invoices = await prisma.$transaction(
    memberIds.map((memberId, index) =>
      prisma.invoice.create({
        data: {
          invoiceNumber: invoiceNumberAtOffset(baseCount, index, year),
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

  for (const invoice of invoices) {
    void ensureMemberStripeCustomer(invoice.memberId).catch(() => {})
    void runInvoiceCreatedWorkflows(invoice.id).catch((e) =>
      console.warn('[crm-invoices] workflow', e),
    )
  }

  return { teamName: team.name, count: invoices.length, ids: invoices.map((i) => i.id) }
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTaxConfig } from '@/lib/tax-config'
import { requireRoles } from '@/lib/rbac-api'
import { ensureMemberStripeCustomer } from '@/lib/stripe-member-customer'
import { runInvoiceCreatedWorkflows } from '@/lib/workflow-engine'

async function nextInvoiceNumber() {
  const year = new Date().getFullYear()
  const prefix = `FV-${year}-`
  const count = await prisma.invoice.count({
    where: { invoiceNumber: { startsWith: prefix } },
  })
  return `${prefix}${String(count + 1).padStart(5, '0')}`
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const memberId = String(body.memberId || '').trim()
  const concepto = String(body.concepto || '').trim()
  const amount = Number(body.amount)
  const dueDateRaw = String(body.dueDate || '').trim()
  const applyTaxRaw = body.applyTax
  const taxRateRaw = body.taxRate
  const applyWithholdingRaw = body.applyWithholding
  const withholdingRateRaw = body.withholdingRate

  if (!memberId || !concepto || !Number.isFinite(amount) || amount <= 0 || !dueDateRaw) {
    return NextResponse.json({ error: 'Datos incompletos o inválidos' }, { status: 400 })
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true },
  })
  if (!member) {
    return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })
  }

  const dueDate = new Date(dueDateRaw)
  if (Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: 'Fecha de vencimiento inválida' }, { status: 400 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const status = dueDate < today ? 'OVERDUE' : 'PENDING'
  const taxConfig = await getTaxConfig()
  const applyTax = typeof applyTaxRaw === 'boolean' ? applyTaxRaw : taxConfig.applyOnInvoices
  const applyWithholding =
    typeof applyWithholdingRaw === 'boolean'
      ? applyWithholdingRaw
      : taxConfig.applyWithholdOnInvoices
  const taxRateInput = Number(taxRateRaw)
  const withholdingRateInput = Number(withholdingRateRaw)
  const taxRate = Number.isFinite(taxRateInput) ? Math.max(0, taxRateInput) : taxConfig.vatRateIncome
  const withholdingRate = Number.isFinite(withholdingRateInput)
    ? Math.max(0, withholdingRateInput)
    : taxConfig.withholdRateIncome
  const taxAmount = applyTax ? Number((amount * (taxRate / 100)).toFixed(2)) : 0
  const withholdingAmount = applyWithholding
    ? Number((amount * (withholdingRate / 100)).toFixed(2))
    : 0
  const totalAmount = Number((amount + taxAmount - withholdingAmount).toFixed(2))

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: await nextInvoiceNumber(),
      kind: 'OTHER',
      issueDate: new Date(),
      dueDate,
      subtotal: amount,
      taxAmount,
      totalAmount,
      paidAmount: 0,
      currency: 'EUR',
      status,
      memberId,
      items: {
        create: [
          {
            description: concepto,
            quantity: 1,
            unitAmount: amount,
            totalAmount: amount,
          },
        ],
      },
    },
    select: { id: true },
  })

  void ensureMemberStripeCustomer(memberId).catch(() => {})
  void runInvoiceCreatedWorkflows(invoice.id).catch((e) =>
    console.warn('[crm/invoices] workflow', e),
  )

  return NextResponse.json({ ok: true, id: invoice.id })
}

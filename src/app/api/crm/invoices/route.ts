import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTaxConfig } from '@/lib/tax-config'
import { requireRoles } from '@/lib/rbac-api'
import { ensureMemberStripeCustomer } from '@/lib/stripe-member-customer'
import { runInvoiceCreatedWorkflows } from '@/lib/workflow-engine'
import { parseCuid } from '@/lib/db-input-validation'

async function invoiceCountForYear(year = new Date().getFullYear()) {
  const prefix = `FV-${year}-`
  return prisma.invoice.count({
    where: { invoiceNumber: { startsWith: prefix } },
  })
}

async function nextInvoiceNumber() {
  const year = new Date().getFullYear()
  const prefix = `FV-${year}-`
  const count = await invoiceCountForYear(year)
  return `${prefix}${String(count + 1).padStart(5, '0')}`
}

function invoiceNumberAtOffset(baseCount: number, offset: number, year = new Date().getFullYear()) {
  const prefix = `FV-${year}-`
  return `${prefix}${String(baseCount + offset + 1).padStart(5, '0')}`
}

type InvoicePayload = {
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

function buildInvoicePayload(
  body: Record<string, unknown>,
  taxConfig: Awaited<ReturnType<typeof getTaxConfig>>,
): InvoicePayload | NextResponse {
  const concepto = String(body.concepto || '').trim()
  const amount = Number(body.amount)
  const dueDateRaw = String(body.dueDate || '').trim()
  const applyTaxRaw = body.applyTax
  const taxRateRaw = body.taxRate
  const applyWithholdingRaw = body.applyWithholding
  const withholdingRateRaw = body.withholdingRate

  if (!concepto || !Number.isFinite(amount) || amount <= 0 || !dueDateRaw) {
    return NextResponse.json({ error: 'Datos incompletos o inválidos' }, { status: 400 })
  }

  const dueDate = new Date(dueDateRaw)
  if (Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: 'Fecha de vencimiento inválida' }, { status: 400 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const status = dueDate < today ? 'OVERDUE' : 'PENDING'
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

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const memberIdRaw = String(body.memberId || '').trim()
  const teamIdRaw = String(body.teamId || '').trim()
  const hasMember = Boolean(memberIdRaw)
  const hasTeam = Boolean(teamIdRaw)

  if (hasMember === hasTeam) {
    return NextResponse.json(
      { error: 'Indica memberId o teamId, pero no ambos.' },
      { status: 400 },
    )
  }

  const taxConfig = await getTaxConfig()
  const payload = buildInvoicePayload(body, taxConfig)
  if (payload instanceof NextResponse) return payload

  if (hasTeam) {
    const parsedTeamId = parseCuid(teamIdRaw, 'teamId')
    if (parsedTeamId instanceof NextResponse) return parsedTeamId

    const team = await prisma.team.findUnique({
      where: { id: parsedTeamId },
      select: { id: true, name: true },
    })
    if (!team) {
      return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 })
    }

    const players = await prisma.teamMember.findMany({
      where: { teamId: parsedTeamId, role: 'PLAYER' },
      select: { memberId: true },
    })
    const memberIds = [...new Set(players.map((p) => p.memberId))]

    if (!memberIds.length) {
      return NextResponse.json(
        { error: 'El equipo no tiene jugadores a los que facturar.' },
        { status: 400 },
      )
    }

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
        console.warn('[crm/invoices] workflow', e),
      )
    }

    return NextResponse.json({
      ok: true,
      count: invoices.length,
      ids: invoices.map((inv) => inv.id),
    })
  }

  const parsedMemberId = parseCuid(memberIdRaw, 'memberId')
  if (parsedMemberId instanceof NextResponse) return parsedMemberId

  const member = await prisma.member.findUnique({
    where: { id: parsedMemberId },
    select: { id: true },
  })
  if (!member) {
    return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })
  }

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
      memberId: parsedMemberId,
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

  void ensureMemberStripeCustomer(parsedMemberId).catch(() => {})
  void runInvoiceCreatedWorkflows(invoice.id).catch((e) =>
    console.warn('[crm/invoices] workflow', e),
  )

  return NextResponse.json({ ok: true, id: invoice.id })
}

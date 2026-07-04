import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTaxConfig } from '@/lib/tax-config'
import { requireRoles } from '@/lib/rbac-api'

async function assertAccountingRole(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) throw new Error('Unauthorized')
}

export async function GET(request: Request) {
  try {
    await assertAccountingRole(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const config = await getTaxConfig()
  return NextResponse.json({ config })
}

export async function PUT(request: Request) {
  try {
    await assertAccountingRole(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const vatRateIncome = Number(body.vatRateIncome)
  const vatRateExpense = Number(body.vatRateExpense)
  const withholdRateIncome = Number(body.withholdRateIncome)
  const withholdRateExpense = Number(body.withholdRateExpense)
  const applyOnInvoices = Boolean(body.applyOnInvoices)
  const applyOnIncome = Boolean(body.applyOnIncome)
  const applyOnExpense = Boolean(body.applyOnExpense)
  const applyWithholdOnInvoices = Boolean(body.applyWithholdOnInvoices)
  const applyWithholdOnIncome = Boolean(body.applyWithholdOnIncome)
  const applyWithholdOnExpense = Boolean(body.applyWithholdOnExpense)
  if (vatRateIncome < 0 || vatRateExpense < 0 || vatRateIncome > 100 || vatRateExpense > 100) {
    return NextResponse.json({ error: 'El IVA debe estar entre 0 y 100' }, { status: 400 })
  }
  if (withholdRateIncome < 0 || withholdRateExpense < 0 || withholdRateIncome > 100 || withholdRateExpense > 100) {
    return NextResponse.json({ error: 'La retención debe estar entre 0 y 100' }, { status: 400 })
  }

  const config = await prisma.taxConfig.upsert({
    where: { isDefault: true },
    update: {
      vatRateIncome,
      vatRateExpense,
      withholdRateIncome,
      withholdRateExpense,
      applyOnInvoices,
      applyOnIncome,
      applyOnExpense,
      applyWithholdOnInvoices,
      applyWithholdOnIncome,
      applyWithholdOnExpense,
    },
    create: {
      isDefault: true,
      vatRateIncome,
      vatRateExpense,
      withholdRateIncome,
      withholdRateExpense,
      applyOnInvoices,
      applyOnIncome,
      applyOnExpense,
      applyWithholdOnInvoices,
      applyWithholdOnIncome,
      applyWithholdOnExpense,
    },
  })
  return NextResponse.json({ ok: true, config })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createJournalEntry } from '@/lib/accounting/engine'
import { ensureBasePgcAccounts } from '@/lib/accounting/pgc'
import { getTaxConfig } from '@/lib/tax-config'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid, parseOptionalAccountCode } from '@/lib/db-input-validation'

async function assertAccountingRole(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) throw new Error('Unauthorized')
}

export async function POST(request: Request) {
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

  const movementType = String(body.movementType || '').toUpperCase()
  const concept = String(body.concept || '').trim()
  const amount = Number(body.amount)
  const entryDate = body.entryDate ? new Date(body.entryDate) : new Date()
  const paymentAccountCodeRaw = String(body.paymentAccountCode || '').trim()
  const categoryAccountCodeRaw = String(body.categoryAccountCode || '').trim()
  const paymentAccountCodeParsed = parseOptionalAccountCode(paymentAccountCodeRaw, 'paymentAccountCode')
  if (paymentAccountCodeParsed instanceof NextResponse) return paymentAccountCodeParsed
  const categoryAccountCodeParsed = parseOptionalAccountCode(categoryAccountCodeRaw, 'categoryAccountCode')
  if (categoryAccountCodeParsed instanceof NextResponse) return categoryAccountCodeParsed
  const paymentAccountCode = paymentAccountCodeParsed ?? ''
  const categoryAccountCode = categoryAccountCodeParsed ?? ''
  const memberIdRaw = body.memberId ? String(body.memberId).trim() : null
  let memberId: string | null = null
  if (memberIdRaw) {
    const parsedMemberId = parseCuid(memberIdRaw, 'memberId')
    if (parsedMemberId instanceof NextResponse) return parsedMemberId
    memberId = parsedMemberId
  }
  const applyTaxRaw = body.applyTax
  const taxRateRaw = Number(body.taxRate)
  const applyWithholdingRaw = body.applyWithholding
  const withholdingRateRaw = Number(body.withholdingRate)

  if (!['INCOME', 'EXPENSE'].includes(movementType)) {
    return NextResponse.json({ error: 'Tipo de movimiento inválido' }, { status: 400 })
  }
  if (!concept || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Concepto o importe inválido' }, { status: 400 })
  }
  if (Number.isNaN(entryDate.getTime())) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }
  if (!paymentAccountCode || !categoryAccountCode) {
    return NextResponse.json({ error: 'Selecciona cuentas contables válidas' }, { status: 400 })
  }

  await ensureBasePgcAccounts()
  const taxConfig = await getTaxConfig()
  const applyTax = typeof applyTaxRaw === 'boolean'
    ? applyTaxRaw
    : movementType === 'INCOME'
    ? taxConfig.applyOnIncome
    : taxConfig.applyOnExpense
  const defaultRate = movementType === 'INCOME' ? taxConfig.vatRateIncome : taxConfig.vatRateExpense
  const defaultWithholdRate =
    movementType === 'INCOME' ? taxConfig.withholdRateIncome : taxConfig.withholdRateExpense
  const taxRate = Number.isFinite(taxRateRaw) ? Math.max(0, taxRateRaw) : defaultRate
  const applyWithholding = typeof applyWithholdingRaw === 'boolean'
    ? applyWithholdingRaw
    : movementType === 'INCOME'
    ? taxConfig.applyWithholdOnIncome
    : taxConfig.applyWithholdOnExpense
  const withholdingRate = Number.isFinite(withholdingRateRaw)
    ? Math.max(0, withholdingRateRaw)
    : defaultWithholdRate
  const taxAmount = applyTax ? Number((amount * (taxRate / 100)).toFixed(2)) : 0
  const withholdingAmount = applyWithholding
    ? Number((amount * (withholdingRate / 100)).toFixed(2))
    : 0
  const totalAmount = Number((amount + taxAmount).toFixed(2))
  const netTreasury = Number((totalAmount - withholdingAmount).toFixed(2))

  const [paymentAccount, categoryAccount] = await Promise.all([
    prisma.accountChart.findUnique({ where: { code: paymentAccountCode } }),
    prisma.accountChart.findUnique({ where: { code: categoryAccountCode } }),
  ])
  if (!paymentAccount?.isActive || !categoryAccount?.isActive) {
    return NextResponse.json({ error: 'La cuenta seleccionada no existe o está inactiva' }, { status: 400 })
  }

  const paymentCodePrefix = paymentAccount.code.slice(0, 2)
  if (!['57', '56'].includes(paymentCodePrefix)) {
    return NextResponse.json(
      { error: 'La cuenta de tesorería debe pertenecer al grupo 57/56 (caja o bancos)' },
      { status: 400 },
    )
  }

  if (movementType === 'INCOME' && categoryAccount.nature !== 'INCOME') {
    return NextResponse.json({ error: 'Para ingresos, la contrapartida debe ser de naturaleza INCOME' }, { status: 400 })
  }
  if (movementType === 'EXPENSE' && categoryAccount.nature !== 'EXPENSE') {
    return NextResponse.json({ error: 'Para gastos, la cuenta principal debe ser de naturaleza EXPENSE' }, { status: 400 })
  }

  try {
    const movement = await prisma.transaction.create({
      data: {
        type: movementType,
        amount: netTreasury,
        description: concept,
        date: entryDate,
        source: 'MANUAL',
      },
    })

    const entry = await createJournalEntry({
      concept,
      entryDate,
      source: 'MANUAL',
      sourceId: movement.id,
      lines:
        movementType === 'INCOME'
          ? [
              {
                accountCode: paymentAccountCode,
                side: 'DEBIT',
                amount: netTreasury,
                lineConcept: 'Entrada de tesorería',
                memberId,
              },
              {
                accountCode: categoryAccountCode,
                side: 'CREDIT',
                amount,
                lineConcept: 'Reconocimiento de ingreso',
                memberId,
              },
              ...(taxAmount > 0
                ? [
                    {
                      accountCode: '4770000',
                      side: 'CREDIT' as const,
                      amount: taxAmount,
                      lineConcept: `IVA repercutido ${taxRate}%`,
                      memberId,
                    },
                  ]
                : []),
              ...(withholdingAmount > 0
                ? [
                    {
                      accountCode: '4730000',
                      side: 'DEBIT' as const,
                      amount: withholdingAmount,
                      lineConcept: `Retención soportada ${withholdingRate}%`,
                      memberId,
                    },
                  ]
                : []),
            ]
          : [
              {
                accountCode: categoryAccountCode,
                side: 'DEBIT',
                amount,
                lineConcept: 'Reconocimiento de gasto',
                memberId,
              },
              {
                accountCode: paymentAccountCode,
                side: 'CREDIT',
                amount: netTreasury,
                lineConcept: 'Salida de tesorería',
                memberId,
              },
              ...(taxAmount > 0
                ? [
                    {
                      accountCode: '4720000',
                      side: 'DEBIT' as const,
                      amount: taxAmount,
                      lineConcept: `IVA soportado ${taxRate}%`,
                      memberId,
                    },
                  ]
                : []),
              ...(withholdingAmount > 0
                ? [
                    {
                      accountCode: '4751000',
                      side: 'CREDIT' as const,
                      amount: withholdingAmount,
                      lineConcept: `Retención practicada ${withholdingRate}%`,
                      memberId,
                    },
                  ]
                : []),
            ],
    })

    return NextResponse.json({
      ok: true,
      movement,
      entry,
      tax: { rate: taxRate, amount: taxAmount },
      withholding: { rate: withholdingRate, amount: withholdingAmount },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'No se pudo registrar el movimiento' }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  try {
    await assertAccountingRole(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const movementIdRaw = String(url.searchParams.get('id') || '').trim()
  const movementId = parseCuid(movementIdRaw, 'id')
  if (movementId instanceof NextResponse) return movementId

  const movement = await prisma.transaction.findUnique({
    where: { id: movementId },
    select: { id: true, source: true, type: true },
  })
  if (!movement) {
    return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 })
  }
  if (movement.source !== 'MANUAL') {
    return NextResponse.json(
      { error: 'Solo se pueden eliminar movimientos manuales desde esta vista' },
      { status: 409 },
    )
  }

  await prisma.$transaction([
    prisma.journalLine.deleteMany({
      where: { entry: { source: 'MANUAL', sourceId: movementId } },
    }),
    prisma.journalEntry.deleteMany({
      where: { source: 'MANUAL', sourceId: movementId },
    }),
    prisma.transaction.delete({
      where: { id: movementId },
    }),
  ])

  return NextResponse.json({ ok: true })
}

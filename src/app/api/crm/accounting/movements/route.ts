import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createJournalEntry } from '@/lib/accounting/engine'
import { ensureBasePgcAccounts } from '@/lib/accounting/pgc'

async function assertAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') throw new Error('Unauthorized')
}

export async function POST(request: Request) {
  try {
    await assertAdmin()
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
  const paymentAccountCode = String(body.paymentAccountCode || '').trim()
  const categoryAccountCode = String(body.categoryAccountCode || '').trim()
  const memberId = body.memberId ? String(body.memberId).trim() : null

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
        amount,
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
                amount,
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
                amount,
                lineConcept: 'Salida de tesorería',
                memberId,
              },
            ],
    })

    return NextResponse.json({ ok: true, movement, entry })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'No se pudo registrar el movimiento' }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  try {
    await assertAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const movementId = String(url.searchParams.get('id') || '').trim()
  if (!movementId) {
    return NextResponse.json({ error: 'Falta el id del movimiento' }, { status: 400 })
  }

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

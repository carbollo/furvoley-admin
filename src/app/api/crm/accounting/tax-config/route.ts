import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTaxConfig } from '@/lib/tax-config'

async function assertAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') throw new Error('Unauthorized')
}

export async function GET() {
  try {
    await assertAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const config = await getTaxConfig()
  return NextResponse.json({ config })
}

export async function PUT(request: Request) {
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

  const vatRateIncome = Number(body.vatRateIncome)
  const vatRateExpense = Number(body.vatRateExpense)
  const applyOnInvoices = Boolean(body.applyOnInvoices)
  const applyOnIncome = Boolean(body.applyOnIncome)
  const applyOnExpense = Boolean(body.applyOnExpense)
  if (vatRateIncome < 0 || vatRateExpense < 0 || vatRateIncome > 100 || vatRateExpense > 100) {
    return NextResponse.json({ error: 'El IVA debe estar entre 0 y 100' }, { status: 400 })
  }

  const config = await prisma.taxConfig.upsert({
    where: { isDefault: true },
    update: {
      vatRateIncome,
      vatRateExpense,
      applyOnInvoices,
      applyOnIncome,
      applyOnExpense,
    },
    create: {
      isDefault: true,
      vatRateIncome,
      vatRateExpense,
      applyOnInvoices,
      applyOnIncome,
      applyOnExpense,
    },
  })
  return NextResponse.json({ ok: true, config })
}

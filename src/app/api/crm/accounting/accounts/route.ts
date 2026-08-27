import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureBasePgcAccounts } from '@/lib/accounting/pgc'
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
  await ensureBasePgcAccounts()
  const accounts = await prisma.accountChart.findMany({
    orderBy: [{ code: 'asc' }],
  })
  return NextResponse.json({ accounts })
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
  const name = String(body.name || '').trim()
  const nature = String(body.nature || '').trim().toUpperCase()
  const VALID_NATURES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']
  if (!name || !VALID_NATURES.includes(nature)) {
    return NextResponse.json(
      { error: 'Indica un nombre y si es un ingreso o un gasto.' },
      { status: 400 },
    )
  }

  // El código del Plan Contable lo pone el servidor. Un tesorero voluntario no
  // tiene por qué saber que un gasto de arbitrajes va en el grupo 629: pedírselo
  // era la razón de que nadie llegara a crear categorías y el club se quedara
  // con las tres de fábrica, metiéndolo todo en «Otros servicios».
  const PREFIJO: Record<string, string> = {
    EXPENSE: '629',
    INCOME: '705',
    ASSET: '572',
    LIABILITY: '410',
    EQUITY: '100',
  }
  let code = String(body.code || '').trim()
  if (!code) {
    const base = PREFIJO[nature]
    const usados = await prisma.accountChart.findMany({
      where: { code: { startsWith: base } },
      select: { code: true },
    })
    const sufijos = new Set(usados.map((a) => a.code.slice(base.length)))
    let n = 1
    while (sufijos.has(String(n).padStart(4, '0'))) n++
    code = base + String(n).padStart(4, '0')
  }

  const level = Number.isInteger(Number(body.level)) ? Number(body.level) : 3
  if (level < 1 || level > 8) {
    return NextResponse.json({ error: 'Nivel de cuenta no válido.' }, { status: 400 })
  }

  const yaExiste = await prisma.accountChart.findFirst({ where: { code }, select: { id: true } })
  if (yaExiste) {
    return NextResponse.json({ error: 'Ya existe una categoría con ese código.' }, { status: 409 })
  }
  const account = await prisma.accountChart.create({
    data: {
      code,
      name,
      level,
      nature,
      isActive: body.isActive !== false,
      parentCode: body.parentCode ? String(body.parentCode) : null,
    },
  })
  return NextResponse.json({ ok: true, account })
}

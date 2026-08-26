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
  const code = String(body.code || '').trim()
  const name = String(body.name || '').trim()
  const level = Number(body.level)
  const nature = String(body.nature || '').trim().toUpperCase()
  const VALID_NATURES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']
  if (!code || !name || !Number.isInteger(level) || level < 1 || level > 8 || !VALID_NATURES.includes(nature)) {
    return NextResponse.json(
      { error: 'Datos de cuenta inválidos. `nature` debe ser ASSET, LIABILITY, EQUITY, INCOME o EXPENSE.' },
      { status: 400 },
    )
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

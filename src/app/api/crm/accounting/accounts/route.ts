import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureBasePgcAccounts } from '@/lib/accounting/pgc'

async function assertAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    throw new Error('Unauthorized')
  }
}

export async function GET() {
  try {
    await assertAdmin()
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
  const code = String(body.code || '').trim()
  const name = String(body.name || '').trim()
  const level = Number(body.level)
  const nature = String(body.nature || '').trim().toUpperCase()
  if (!code || !name || !Number.isInteger(level) || level < 1 || level > 8 || !nature) {
    return NextResponse.json({ error: 'Datos de cuenta inválidos' }, { status: 400 })
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

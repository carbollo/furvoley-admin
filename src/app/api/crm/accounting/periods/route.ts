import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
  const periods = await prisma.fiscalPeriod.findMany({ orderBy: { startsAt: 'desc' }, take: 36 })
  return NextResponse.json({ periods })
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
  const startsAt = new Date(String(body.startsAt || ''))
  const endsAt = new Date(String(body.endsAt || ''))
  if (!code || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: 'Periodo inválido' }, { status: 400 })
  }
  const p = await prisma.fiscalPeriod.upsert({
    where: { code },
    create: { code, startsAt, endsAt, isClosed: !!body.isClosed },
    update: { startsAt, endsAt, isClosed: !!body.isClosed },
  })
  return NextResponse.json({ ok: true, period: p })
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createJournalEntry } from '@/lib/accounting/engine'

async function assertAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') throw new Error('Unauthorized')
}

export async function GET(request: Request) {
  try {
    await assertAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const accountCode = url.searchParams.get('accountCode')
  const whereDate: any = {}
  if (from) whereDate.gte = new Date(from)
  if (to) whereDate.lte = new Date(to)
  const entries = await prisma.journalEntry.findMany({
    where: {
      ...(from || to ? { entryDate: whereDate } : {}),
      ...(accountCode
        ? {
            lines: {
              some: {
                account: { code: accountCode },
              },
            },
          }
        : {}),
    },
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      fiscalPeriod: true,
      lines: {
        include: { account: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    take: 300,
  })
  return NextResponse.json({ entries })
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

  try {
    const entry = await createJournalEntry({
      concept: String(body.concept || '').trim(),
      entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
      reference: body.reference ? String(body.reference) : undefined,
      source: body.source ? String(body.source) : 'MANUAL',
      sourceId: body.sourceId ? String(body.sourceId) : undefined,
      lines: Array.isArray(body.lines)
        ? body.lines.map((l: any) => ({
            accountCode: String(l.accountCode || ''),
            side: String(l.side || '').toUpperCase(),
            amount: Number(l.amount),
            lineConcept: l.lineConcept ? String(l.lineConcept) : undefined,
            memberId: l.memberId ? String(l.memberId) : null,
            costCenter: l.costCenter ? String(l.costCenter) : null,
          }))
        : [],
    })
    return NextResponse.json({ ok: true, entry })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'No se pudo crear el asiento' }, { status: 400 })
  }
}

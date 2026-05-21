import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createJournalEntry } from '@/lib/accounting/engine'
import { requireRoles } from '@/lib/rbac-api'
import {
  parseIsoDateParam,
  parseOptionalAccountCode,
} from '@/lib/db-input-validation'

async function assertAccountingRole() {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) throw new Error('Unauthorized')
}

export async function GET(request: Request) {
  try {
    await assertAccountingRole()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  const fromRaw = parseIsoDateParam(url.searchParams.get('from'), 'from')
  if (fromRaw instanceof NextResponse) return fromRaw
  const toRaw = parseIsoDateParam(url.searchParams.get('to'), 'to')
  if (toRaw instanceof NextResponse) return toRaw
  const accountCodeRaw = parseOptionalAccountCode(url.searchParams.get('accountCode'))
  if (accountCodeRaw instanceof NextResponse) return accountCodeRaw

  const whereDate: { gte?: Date; lte?: Date } = {}
  if (fromRaw) whereDate.gte = fromRaw
  if (toRaw) whereDate.lte = toRaw

  const entries = await prisma.journalEntry.findMany({
    where: {
      ...(fromRaw || toRaw ? { entryDate: whereDate } : {}),
      ...(accountCodeRaw
        ? {
            lines: {
              some: {
                account: { code: accountCodeRaw },
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
    await assertAccountingRole()
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

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  const rows = await prisma.clubHoliday.findMany({
    orderBy: { date: 'asc' },
  })

  return NextResponse.json({
    holidays: rows.map((h) => ({
      id: h.id,
      date: h.date.toISOString().slice(0, 10),
      name: h.name ?? '',
    })),
  })
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const dateStr = String(body.date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'date debe ser YYYY-MM-DD' }, { status: 400 })
  }

  const date = new Date(`${dateStr}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Fecha no válida' }, { status: 400 })
  }

  const name =
    typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null

  const row = await prisma.clubHoliday.create({
    data: { date, name },
  })

  return NextResponse.json({
    holiday: {
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      name: row.name ?? '',
    },
  })
}

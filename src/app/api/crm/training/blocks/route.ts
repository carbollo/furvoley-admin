import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'

export const dynamic = 'force-dynamic'

// POST: crea un bloque dentro de una sesión. La posición se calcula como el
// siguiente hueco (max+1) para respetar el orden del timeline.
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const sessionId = parseCuid(String(body?.sessionId || ''), 'sessionId')
  if (sessionId instanceof Response) return sessionId
  const session = await prisma.trainingSession.findUnique({ where: { id: sessionId }, select: { id: true } })
  if (!session) return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 })

  const name = String(body?.name || '').trim() || 'Bloque'
  const agg = await prisma.trainingBlock.aggregate({ where: { sessionId }, _max: { position: true } })
  const position = (agg._max.position ?? -1) + 1

  const created = await prisma.trainingBlock.create({
    data: {
      sessionId,
      name: name.slice(0, 120),
      durationMin: normalizeDuration(body?.durationMin),
      position,
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, id: created.id })
}

function normalizeDuration(v: unknown): number | null {
  const n = Math.trunc(Number(v))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(600, n)
}

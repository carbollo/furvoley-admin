import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'
import { isCourtType, sanitizeDiagram } from '@/lib/training'

export const dynamic = 'force-dynamic'

// POST: crea un ejercicio dentro de un bloque, con su diagrama de pizarra táctica.
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const blockId = parseCuid(String(body?.blockId || ''), 'blockId')
  if (blockId instanceof Response) return blockId
  const block = await prisma.trainingBlock.findUnique({ where: { id: blockId }, select: { id: true } })
  if (!block) return NextResponse.json({ error: 'Bloque no encontrado.' }, { status: 404 })

  const name = String(body?.name || '').trim() || 'Ejercicio'
  const courtType = isCourtType(body?.courtType) ? body.courtType : 'volleyball'
  const diagram = sanitizeDiagram(body?.diagram) ?? {
    courtType,
    transitionMs: 900,
    tokens: [],
    slides: [{ id: 's1', positions: {} }],
  }

  const agg = await prisma.trainingExercise.aggregate({ where: { blockId }, _max: { position: true } })
  const position = (agg._max.position ?? -1) + 1

  const created = await prisma.trainingExercise.create({
    data: {
      blockId,
      name: name.slice(0, 160),
      description: body?.description ? String(body.description).slice(0, 4000) : null,
      durationMin: normalizeDuration(body?.durationMin),
      players: normalizePlayers(body?.players),
      courtType: diagram.courtType,
      diagram: diagram as never,
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

function normalizePlayers(v: unknown): number | null {
  const n = Math.trunc(Number(v))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(60, n)
}

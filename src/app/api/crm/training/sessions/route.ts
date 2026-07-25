import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'
import { normalizeTags } from '@/lib/training'

export const dynamic = 'force-dynamic'

// GET: lista de sesiones para el navegador de contenido. Incluye, por sesión,
// nº de bloques y ejercicios, duración (propia o sumada de bloques) y un
// "thumb" (el diagrama del primer ejercicio) para pintar la miniatura de campo.
// ?collectionId=<cuid> filtra por colección; ?collectionId=none = sueltas.
export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const collectionParam = url.searchParams.get('collectionId')
  let where: Record<string, unknown> = {}
  if (collectionParam === 'none') {
    where = { collectionId: null }
  } else if (collectionParam) {
    const parsed = parseCuid(collectionParam, 'collectionId')
    if (parsed instanceof Response) return parsed
    where = { collectionId: parsed }
  }

  const sessions = await prisma.trainingSession.findMany({
    where,
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      objective: true,
      tags: true,
      durationMin: true,
      groupId: true,
      collectionId: true,
      collection: { select: { name: true } },
      blocks: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: {
          durationMin: true,
          _count: { select: { exercises: true } },
          exercises: {
            take: 1,
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            select: { diagram: true, courtType: true },
          },
        },
      },
    },
  })

  return NextResponse.json({
    sessions: sessions.map((s) => {
      const blockCount = s.blocks.length
      const exerciseCount = s.blocks.reduce((acc, b) => acc + b._count.exercises, 0)
      const summedDuration = s.blocks.reduce((acc, b) => acc + (b.durationMin || 0), 0)
      const firstExercise = s.blocks.flatMap((b) => b.exercises)[0] || null
      return {
        id: s.id,
        title: s.title,
        objective: s.objective,
        tags: s.tags,
        durationMin: s.durationMin ?? (summedDuration > 0 ? summedDuration : null),
        groupId: s.groupId,
        collectionId: s.collectionId,
        collectionName: s.collection?.name ?? null,
        blockCount,
        exerciseCount,
        // La miniatura solo pinta la primera diapositiva: recortamos el diagrama
        // para no transferir todas las slides del ejercicio en el listado.
        thumb: firstExercise
          ? { diagram: thumbDiagram(firstExercise.diagram), courtType: firstExercise.courtType }
          : null,
      }
    }),
  })
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const title = String(body?.title || '').trim()
  if (!title) return NextResponse.json({ error: 'El título es obligatorio.' }, { status: 400 })

  let collectionId: string | null = null
  if (body?.collectionId) {
    const parsed = parseCuid(String(body.collectionId), 'collectionId')
    if (parsed instanceof Response) return parsed
    const exists = await prisma.trainingCollection.findUnique({ where: { id: parsed }, select: { id: true } })
    if (!exists) return NextResponse.json({ error: 'Colección no encontrada.' }, { status: 404 })
    collectionId = parsed
  }

  const groupId = body?.groupId ? String(body.groupId).slice(0, 60) : null

  const created = await prisma.trainingSession.create({
    data: {
      title: title.slice(0, 160),
      objective: body?.objective ? String(body.objective).slice(0, 4000) : null,
      tags: normalizeTags(body?.tags),
      durationMin: normalizeDuration(body?.durationMin),
      groupId,
      collectionId,
      // Arranca con un bloque por defecto para que la sesión sea usable al momento.
      blocks: { create: [{ name: 'Parte principal', position: 0 }] },
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

// Recorta un diagrama a lo justo para la miniatura (courtType + fichas + 1ª slide).
function thumbDiagram(diagram: unknown): unknown {
  if (!diagram || typeof diagram !== 'object') return null
  const d = diagram as { courtType?: unknown; tokens?: unknown; slides?: unknown }
  const slides = Array.isArray(d.slides) && d.slides.length ? [d.slides[0]] : []
  return {
    courtType: d.courtType,
    tokens: Array.isArray(d.tokens) ? d.tokens : [],
    slides,
  }
}

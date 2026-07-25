import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'
import { normalizeTags } from '@/lib/training'

export const dynamic = 'force-dynamic'

// GET: detalle completo de la sesión con bloques y ejercicios (incl. diagrama).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response
  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  const session = await prisma.trainingSession.findUnique({
    where: { id: parsedId },
    select: {
      id: true,
      title: true,
      objective: true,
      tags: true,
      durationMin: true,
      groupId: true,
      collectionId: true,
      collection: { select: { id: true, name: true } },
      blocks: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          durationMin: true,
          position: true,
          exercises: {
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              name: true,
              description: true,
              durationMin: true,
              players: true,
              courtType: true,
              diagram: true,
              position: true,
            },
          },
        },
      },
    },
  })
  if (!session) return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 })
  return NextResponse.json({ session })
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response
  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body?.title === 'string') {
    const title = body.title.trim()
    if (!title) return NextResponse.json({ error: 'El título no puede quedar vacío.' }, { status: 400 })
    data.title = title.slice(0, 160)
  }
  if ('objective' in body) data.objective = body.objective ? String(body.objective).slice(0, 4000) : null
  if ('tags' in body) data.tags = normalizeTags(body.tags)
  if ('durationMin' in body) {
    const n = Math.trunc(Number(body.durationMin))
    data.durationMin = Number.isFinite(n) && n > 0 ? Math.min(600, n) : null
  }
  if ('groupId' in body) data.groupId = body.groupId ? String(body.groupId).slice(0, 60) : null
  if ('collectionId' in body) {
    if (!body.collectionId) {
      data.collectionId = null
    } else {
      const parsed = parseCuid(String(body.collectionId), 'collectionId')
      if (parsed instanceof Response) return parsed
      const exists = await prisma.trainingCollection.findUnique({ where: { id: parsed }, select: { id: true } })
      if (!exists) return NextResponse.json({ error: 'Colección no encontrada.' }, { status: 404 })
      data.collectionId = parsed
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 })
  }

  try {
    await prisma.trainingSession.update({ where: { id: parsedId }, data })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 })
    }
    throw e
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response
  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  try {
    // Cascade borra bloques y ejercicios de la sesión.
    await prisma.trainingSession.delete({ where: { id: parsedId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 })
    }
    throw e
  }
}

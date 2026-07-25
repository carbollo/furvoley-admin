import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { isCourtType, normalizeTags } from '@/lib/training'

export const dynamic = 'force-dynamic'

// GET: lista de colecciones con nº de sesiones (el nº de ejercicios se agrega en
// el cliente a partir de /sessions para no anidar tres niveles de conteo).
export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  const collections = await prisma.trainingCollection.findMany({
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      description: true,
      courtType: true,
      tags: true,
      _count: { select: { sessions: true } },
    },
  })
  return NextResponse.json({
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      courtType: c.courtType,
      tags: c.tags,
      sessionCount: c._count.sessions,
    })),
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
  const name = String(body?.name || '').trim()
  if (!name) return NextResponse.json({ error: 'El nombre es obligatorio.' }, { status: 400 })

  const created = await prisma.trainingCollection.create({
    data: {
      name: name.slice(0, 120),
      description: body?.description ? String(body.description).slice(0, 2000) : null,
      courtType: isCourtType(body?.courtType) ? body.courtType : 'volleyball',
      tags: normalizeTags(body?.tags),
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, id: created.id })
}

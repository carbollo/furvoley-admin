import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'
import { isCourtType, normalizeTags } from '@/lib/training'

export const dynamic = 'force-dynamic'

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
  if (typeof body?.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'El nombre no puede quedar vacío.' }, { status: 400 })
    data.name = name.slice(0, 120)
  }
  if ('description' in body) data.description = body.description ? String(body.description).slice(0, 2000) : null
  if (isCourtType(body?.courtType)) data.courtType = body.courtType
  if ('tags' in body) data.tags = normalizeTags(body.tags)

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 })
  }

  try {
    await prisma.trainingCollection.update({ where: { id: parsedId }, data })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Colección no encontrada.' }, { status: 404 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response
  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  try {
    // Al borrar la colección, sus sesiones quedan sueltas (onDelete: SetNull).
    await prisma.trainingCollection.delete({ where: { id: parsedId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Colección no encontrada.' }, { status: 404 })
  }
}

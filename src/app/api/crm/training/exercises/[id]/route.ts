import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'
import { isCourtType, sanitizeDiagram } from '@/lib/training'

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
    data.name = name.slice(0, 160)
  }
  if ('description' in body) data.description = body.description ? String(body.description).slice(0, 4000) : null
  if ('durationMin' in body) {
    const n = Math.trunc(Number(body.durationMin))
    data.durationMin = Number.isFinite(n) && n > 0 ? Math.min(600, n) : null
  }
  if ('players' in body) {
    const n = Math.trunc(Number(body.players))
    data.players = Number.isFinite(n) && n > 0 ? Math.min(60, n) : null
  }
  if ('diagram' in body) {
    const diagram = sanitizeDiagram(body.diagram)
    if (diagram) {
      data.diagram = diagram as never
      data.courtType = diagram.courtType // mantener courtType en sync con el diagrama
    }
  } else if (isCourtType(body?.courtType)) {
    data.courtType = body.courtType
  }
  if ('position' in body) {
    const n = Math.trunc(Number(body.position))
    if (Number.isFinite(n) && n >= 0) data.position = n
  }
  if ('blockId' in body && body.blockId) {
    const targetBlock = parseCuid(String(body.blockId), 'blockId')
    if (targetBlock instanceof Response) return targetBlock
    const block = await prisma.trainingBlock.findUnique({ where: { id: targetBlock }, select: { id: true } })
    if (!block) return NextResponse.json({ error: 'Bloque destino no encontrado.' }, { status: 404 })
    data.blockId = targetBlock
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 })
  }

  try {
    await prisma.trainingExercise.update({ where: { id: parsedId }, data })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Ejercicio no encontrado.' }, { status: 404 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response
  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  try {
    await prisma.trainingExercise.delete({ where: { id: parsedId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Ejercicio no encontrado.' }, { status: 404 })
  }
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'

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
  if ('durationMin' in body) {
    const n = Math.trunc(Number(body.durationMin))
    data.durationMin = Number.isFinite(n) && n > 0 ? Math.min(600, n) : null
  }
  if ('position' in body) {
    const n = Math.trunc(Number(body.position))
    if (Number.isFinite(n) && n >= 0) data.position = n
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 })
  }

  try {
    await prisma.trainingBlock.update({ where: { id: parsedId }, data })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Bloque no encontrado.' }, { status: 404 })
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
    await prisma.trainingBlock.delete({ where: { id: parsedId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Bloque no encontrado.' }, { status: 404 })
    }
    throw e
  }
}

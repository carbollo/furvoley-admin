import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'

export const dynamic = 'force-dynamic'

function parseAge(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 120) return NaN as unknown as number
  return Math.floor(n)
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'categoryId')
  if (parsedId instanceof Response) return parsedId

  let body: { name?: string; minAge?: unknown; maxAge?: unknown; defaultGroupId?: string | null; isActive?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Nombre no válido' }, { status: 400 })
    data.name = name
  }
  if (body.minAge !== undefined) {
    const minAge = parseAge(body.minAge)
    if (Number.isNaN(minAge)) return NextResponse.json({ error: 'Edad no válida' }, { status: 400 })
    data.minAge = minAge
  }
  if (body.maxAge !== undefined) {
    const maxAge = parseAge(body.maxAge)
    if (Number.isNaN(maxAge)) return NextResponse.json({ error: 'Edad no válida' }, { status: 400 })
    data.maxAge = maxAge
  }
  if (body.defaultGroupId !== undefined) {
    data.defaultGroupId = body.defaultGroupId ? String(body.defaultGroupId).trim() : null
  }
  if (body.isActive !== undefined) data.isActive = body.isActive === true

  try {
    await prisma.category.update({ where: { id: parsedId }, data })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
    }
    return NextResponse.json({ error: 'No se pudo actualizar la categoría' }, { status: 400 })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'], _request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'categoryId')
  if (parsedId instanceof Response) return parsedId

  try {
    await prisma.category.delete({ where: { id: parsedId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo eliminar la categoría' }, { status: 400 })
  }
}

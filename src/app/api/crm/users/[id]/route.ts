import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { normalizeRole } from '@/lib/rbac'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId
  let body: {
    name?: string
    role?: string
    memberId?: string | null
    password?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string') data.name = body.name.trim() || null
  if (typeof body.role === 'string') data.role = normalizeRole(body.role)
  if (body.memberId !== undefined) data.memberId = body.memberId ? String(body.memberId).trim() : null
  if (typeof body.password === 'string' && body.password.trim()) {
    if (body.password.trim().length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }
    data.password = await bcrypt.hash(body.password.trim(), 10)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No hay cambios para guardar' }, { status: 400 })
  }

  try {
    await prisma.user.update({
      where: { id: parsedId },
      data,
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Conflicto de datos (email/socio ya en uso)' }, { status: 409 })
    }
    return NextResponse.json({ error: 'No se pudo actualizar la cuenta' }, { status: 400 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN'], _request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId
  const meId = (auth.session.user as { id?: string }).id
  if (parsedId === meId) {
    return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta desde aquí' }, { status: 400 })
  }

  try {
    await prisma.user.delete({ where: { id: parsedId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo eliminar la cuenta' }, { status: 400 })
  }
}

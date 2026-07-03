import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'
import { subtreeIdsOf } from '@/lib/groups'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'groupId')
  if (parsedId instanceof Response) return parsedId

  let body: { name?: string; parentId?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: { name?: string; parentId?: string | null } = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Nombre no válido' }, { status: 400 })
    data.name = name
  }
  if (body.parentId !== undefined) {
    if (body.parentId === null || body.parentId === '') {
      data.parentId = null
    } else {
      const parsedParent = parseCuid(String(body.parentId), 'parentId')
      if (parsedParent instanceof Response) return parsedParent
      if (parsedParent === parsedId) {
        return NextResponse.json({ error: 'Un grupo no puede ser su propio padre' }, { status: 400 })
      }
      // Evitar ciclos: el nuevo padre no puede estar dentro del subárbol del grupo.
      const groups = await prisma.group.findMany({ select: { id: true, name: true, parentId: true } })
      if (subtreeIdsOf(parsedId, groups).includes(parsedParent)) {
        return NextResponse.json({ error: 'No puedes mover un grupo dentro de sí mismo' }, { status: 400 })
      }
      const parent = await prisma.group.findUnique({ where: { id: parsedParent }, select: { id: true } })
      if (!parent) return NextResponse.json({ error: 'Grupo padre no encontrado' }, { status: 404 })
      data.parentId = parsedParent
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Sin datos para actualizar' }, { status: 400 })
  }

  try {
    await prisma.group.update({ where: { id: parsedId }, data })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar el grupo' }, { status: 400 })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'groupId')
  if (parsedId instanceof Response) return parsedId

  try {
    // Los subgrupos pasan a raíz (parentId SetNull); las membresías directas se borran en cascada.
    await prisma.group.delete({ where: { id: parsedId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo eliminar el grupo' }, { status: 400 })
  }
}

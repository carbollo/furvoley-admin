import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'
import { getGroupTree } from '@/lib/groups'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const tree = await getGroupTree()
  return NextResponse.json({ tree })
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  let body: { name?: string; parentId?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  let parentId: string | null = null
  if (body.parentId) {
    const parsed = parseCuid(String(body.parentId), 'parentId')
    if (parsed instanceof Response) return parsed
    const parent = await prisma.group.findUnique({ where: { id: parsed }, select: { id: true } })
    if (!parent) return NextResponse.json({ error: 'Grupo padre no encontrado' }, { status: 404 })
    parentId = parsed
  }

  const created = await prisma.group.create({
    data: { name, parentId },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, id: created.id })
}

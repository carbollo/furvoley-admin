import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'
import { getEffectiveGroupMembers, normalizeGroupRole } from '@/lib/groups'

export const dynamic = 'force-dynamic'

/** Miembros efectivos del grupo (directos + los de sus subgrupos). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'groupId')
  if (parsedId instanceof Response) return parsedId

  const group = await prisma.group.findUnique({ where: { id: parsedId }, select: { id: true, name: true } })
  if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  const members = await getEffectiveGroupMembers(parsedId)
  return NextResponse.json({ group, members })
}

/** Añade un socio directamente a este grupo. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'groupId')
  if (parsedId instanceof Response) return parsedId

  let body: { memberId?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsedMemberId = parseCuid(String(body.memberId || ''), 'memberId')
  if (parsedMemberId instanceof Response) return parsedMemberId

  const [group, member] = await Promise.all([
    prisma.group.findUnique({ where: { id: parsedId }, select: { id: true } }),
    prisma.member.findUnique({ where: { id: parsedMemberId }, select: { id: true } }),
  ])
  if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })
  if (!member) return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })

  const role = normalizeGroupRole(body.role)
  await prisma.groupMembership.upsert({
    where: { groupId_memberId: { groupId: parsedId, memberId: parsedMemberId } },
    create: { groupId: parsedId, memberId: parsedMemberId, role },
    update: { role },
  })
  return NextResponse.json({ ok: true })
}

/** Quita la pertenencia DIRECTA de un socio a este grupo (?memberId=...). */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'groupId')
  if (parsedId instanceof Response) return parsedId

  const url = new URL(request.url)
  const parsedMemberId = parseCuid(String(url.searchParams.get('memberId') || ''), 'memberId')
  if (parsedMemberId instanceof Response) return parsedMemberId

  const result = await prisma.groupMembership.deleteMany({
    where: { groupId: parsedId, memberId: parsedMemberId },
  })
  if (result.count === 0) {
    return NextResponse.json(
      { error: 'Ese socio no es miembro directo de este grupo (pertenece a través de un subgrupo; quítalo desde ahí).' },
      { status: 404 },
    )
  }
  return NextResponse.json({ ok: true })
}

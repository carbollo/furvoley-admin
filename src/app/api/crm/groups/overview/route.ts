import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { normalizeGroupRole } from '@/lib/groups'

export const dynamic = 'force-dynamic'

/**
 * Vista "al entrar en el club" (roadmap · 5.2, image14): listado de todos los
 * miembros con sus grupos DIRECTOS y rol en cada uno. Las pertenencias
 * heredadas se derivan en cliente a partir del árbol (descendientes de los
 * grupos directos).
 */
export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const members = await prisma.member.findMany({
    orderBy: { name: 'asc' },
    take: 500,
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      groupMemberships: {
        select: { role: true, group: { select: { id: true, name: true } } },
      },
    },
  })

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email || '',
      status: m.status,
      groups: m.groupMemberships.map((gm) => ({
        id: gm.group.id,
        name: gm.group.name,
        role: normalizeGroupRole(gm.role),
      })),
    })),
  })
}

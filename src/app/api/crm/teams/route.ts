import { NextResponse } from 'next/server'
import { createTeam } from '@/app/actions/teams'
import { requireRoles } from '@/lib/rbac-api'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const teams = await prisma.team.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { members: true } } },
  })

  return NextResponse.json({
    ok: true,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      memberCount: t._count.members,
    })),
  })
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  let body: { name?: string; category?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }

  const team = await createTeam({
    name,
    category: body.category?.trim() || undefined,
  })

  return NextResponse.json({ ok: true, id: team.id })
}

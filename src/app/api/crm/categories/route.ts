import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { categoryBirthYearWindow } from '@/lib/categories'

export const dynamic = 'force-dynamic'

function parseAge(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 120) return NaN as unknown as number
  return Math.floor(n)
}

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  const categories = await prisma.category.findMany({
    orderBy: [{ minAge: 'asc' }, { name: 'asc' }],
  })

  const now = new Date()
  return NextResponse.json({
    categories: categories.map((c) => {
      const win = categoryBirthYearWindow(c, now)
      return {
        id: c.id,
        name: c.name,
        minAge: c.minAge,
        maxAge: c.maxAge,
        defaultGroupId: c.defaultGroupId,
        isActive: c.isActive,
        // Años de nacimiento que cubre la categoría esta temporada (informativo).
        birthYearFrom: win.fromYear,
        birthYearTo: win.toYear,
      }
    }),
  })
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  let body: { name?: string; minAge?: unknown; maxAge?: unknown; defaultGroupId?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const minAge = parseAge(body.minAge)
  const maxAge = parseAge(body.maxAge)
  if (Number.isNaN(minAge) || Number.isNaN(maxAge)) {
    return NextResponse.json({ error: 'Edad no válida' }, { status: 400 })
  }
  if (minAge != null && maxAge != null && minAge > maxAge) {
    return NextResponse.json({ error: 'La edad mínima no puede ser mayor que la máxima' }, { status: 400 })
  }

  try {
    const created = await prisma.category.create({
      data: {
        name,
        minAge,
        maxAge,
        defaultGroupId: body.defaultGroupId ? String(body.defaultGroupId).trim() : null,
      },
      select: { id: true },
    })
    return NextResponse.json({ ok: true, id: created.id })
  } catch (e: unknown) {
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
    }
    return NextResponse.json({ error: 'No se pudo crear la categoría' }, { status: 400 })
  }
}

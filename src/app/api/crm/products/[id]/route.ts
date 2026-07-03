import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'

export const dynamic = 'force-dynamic'

/** Activar/desactivar o retocar un producto (los vendidos no se borran). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'productId')
  if (parsedId instanceof Response) return parsedId

  let body: { name?: string; price?: unknown; isActive?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: { name?: string; price?: number; isActive?: boolean } = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'Nombre no válido' }, { status: 400 })
    data.name = name
  }
  if (body.price !== undefined) {
    const price = Number(body.price)
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Precio no válido' }, { status: 400 })
    }
    data.price = price
  }
  if (body.isActive !== undefined) data.isActive = body.isActive === true

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Sin datos para actualizar' }, { status: 400 })
  }

  try {
    await prisma.product.update({ where: { id: parsedId }, data })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
  }
}

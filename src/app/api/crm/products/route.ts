import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

export const dynamic = 'force-dynamic'

const PRODUCT_TYPES = ['ONE_TIME', 'EVENT'] as const

export async function GET() {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

  const products = await prisma.product.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      type: true,
      isActive: true,
      createdAt: true,
      _count: { select: { orderItems: true } },
    },
  })

  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      price: p.price,
      type: PRODUCT_TYPES.includes(p.type as (typeof PRODUCT_TYPES)[number]) ? p.type : 'ONE_TIME',
      isActive: p.isActive,
      sales: p._count.orderItems,
      createdAt: p.createdAt.toISOString().slice(0, 10),
    })),
  })
}

/** Alta de producto (roadmap · 6.4): nombre, tipo y precio. */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

  let body: { name?: string; type?: string; price?: unknown; description?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const type = String(body.type || 'ONE_TIME').toUpperCase()
  if (!PRODUCT_TYPES.includes(type as (typeof PRODUCT_TYPES)[number])) {
    return NextResponse.json({ error: 'Tipo no válido (pago único o evento)' }, { status: 400 })
  }

  const price = Number(body.price)
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: 'Precio no válido' }, { status: 400 })
  }

  const created = await prisma.product.create({
    data: {
      name,
      type,
      price,
      description: String(body.description || '').trim() || null,
      isActive: true,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id })
}

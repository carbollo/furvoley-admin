import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

export const dynamic = 'force-dynamic'

const PRODUCT_TYPES = ['ONE_TIME', 'SUBSCRIPTION'] as const
const BILLING_PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const

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
      billingPeriod: true,
      subscriptionPlanId: true,
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
      // Los antiguos "EVENT" se muestran como pago único.
      type: p.type === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'ONE_TIME',
      billingPeriod: p.billingPeriod,
      subscriptionPlanId: p.subscriptionPlanId,
      isActive: p.isActive,
      sales: p._count.orderItems,
      createdAt: p.createdAt.toISOString().slice(0, 10),
    })),
  })
}

/**
 * Alta de producto (roadmap · 6.4): pago único o suscripción.
 * Si es suscripción, se crea un plan de cuota vinculado con la misma
 * periodicidad: el cobro recurrente lo ejecuta el motor de Suscripciones
 * (asignable a socios o grupos como cualquier plan).
 */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

  let body: { name?: string; type?: string; price?: unknown; description?: string; billingPeriod?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const type = String(body.type || 'ONE_TIME').toUpperCase()
  if (!PRODUCT_TYPES.includes(type as (typeof PRODUCT_TYPES)[number])) {
    return NextResponse.json({ error: 'Tipo no válido (pago único o suscripción)' }, { status: 400 })
  }

  const price = Number(body.price)
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: 'Precio no válido' }, { status: 400 })
  }

  let billingPeriod: string | null = null
  if (type === 'SUBSCRIPTION') {
    billingPeriod = String(body.billingPeriod || 'MONTHLY').toUpperCase()
    if (!BILLING_PERIODS.includes(billingPeriod as (typeof BILLING_PERIODS)[number])) {
      return NextResponse.json({ error: 'Periodicidad no válida (mensual, trimestral o anual)' }, { status: 400 })
    }
  }

  const description = String(body.description || '').trim() || null

  // Producto de suscripción → plan de cuota vinculado (con reintento si el nombre ya existe).
  let subscriptionPlanId: string | null = null
  if (type === 'SUBSCRIPTION') {
    const planData = {
      description: description || `Producto de suscripción`,
      amount: price,
      billingPeriod: billingPeriod!,
      isActive: true,
    }
    try {
      const plan = await prisma.membershipPlan.create({
        data: { name, ...planData },
        select: { id: true },
      })
      subscriptionPlanId = plan.id
    } catch (e: unknown) {
      if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
        const plan = await prisma.membershipPlan.create({
          data: { name: `${name} (producto)`, ...planData },
          select: { id: true },
        })
        subscriptionPlanId = plan.id
      } else {
        return NextResponse.json({ error: 'No se pudo crear el plan de cobro recurrente' }, { status: 400 })
      }
    }
  }

  const created = await prisma.product.create({
    data: {
      name,
      type,
      price,
      description,
      billingPeriod,
      subscriptionPlanId,
      isActive: true,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id, subscriptionPlanId })
}

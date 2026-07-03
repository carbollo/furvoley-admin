import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { createSubscription } from '@/app/actions/billing'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const memberId = String(body.memberId || '').trim()
  const planId = String(body.planId || '').trim()
  if (!memberId || !planId) {
    return NextResponse.json({ error: 'Socio y plan son obligatorios' }, { status: 400 })
  }

  const member = await prisma.member.findUnique({ where: { id: memberId } })
  if (!member) {
    return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })
  }

  const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } })
  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: 'Plan no encontrado o inactivo' }, { status: 404 })
  }

  let startDate: Date | undefined
  if (body.startDate) {
    const d = new Date(String(body.startDate))
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Fecha de inicio inválida' }, { status: 400 })
    }
    startDate = d
  }

  const autoPay = body.autoPay === true
  const paymentRequiredOnEnrollment =
    typeof body.paymentRequiredOnEnrollment === 'boolean'
      ? body.paymentRequiredOnEnrollment
      : plan.paymentRequiredOnEnrollment

  // Descuento opcional (roadmap · 6.5): por id o por código (HERMANOS10).
  let discountCodeId: string | null = null
  const rawDiscountId = String((body as { discountCodeId?: string }).discountCodeId || '').trim()
  const rawDiscountCode = String((body as { discountCode?: string }).discountCode || '').trim()
  if (rawDiscountId || rawDiscountCode) {
    const discount = rawDiscountId
      ? await prisma.discountCode.findUnique({ where: { id: rawDiscountId } })
      : await prisma.discountCode.findUnique({ where: { code: rawDiscountCode.toUpperCase() } })
    if (!discount || !discount.isActive) {
      return NextResponse.json({ error: 'Código de descuento no válido o inactivo' }, { status: 404 })
    }
    discountCodeId = discount.id
  }

  try {
    await prisma.subscription.updateMany({
      where: { memberId, status: 'ACTIVE' },
      data: { status: 'CANCELED', endDate: new Date() },
    })

    const subscription = await createSubscription({
      memberId,
      planId,
      startDate,
      autoPay,
      paymentRequiredOnEnrollment,
      discountCodeId,
    })

    return NextResponse.json({
      ok: true,
      subscription: {
        id: subscription.id,
        memberId: subscription.memberId,
        planId: subscription.planId,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo asignar la cuota'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

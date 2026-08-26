import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { billingPeriodDays as whopBillingPeriodDays } from '@/lib/whop/plans'
import { clampBillingDay } from '@/lib/billing-dates'
import { SUBSCRIPTION_VISIBLE, SUBSCRIPTION_ACTIVE_LIKE } from '@/lib/subscription-statuses'
import {
  createMembershipPlan,
  deleteMembershipPlan,
  updateMembershipPlan,
} from '@/app/actions/billing'

const BILLING_PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const

function periodLabel(p: string) {
  if (p === 'QUARTERLY') return 'Trimestral'
  if (p === 'YEARLY') return 'Anual'
  return 'Mensual'
}

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const [plans, subscriptions, sinCuota] = await Promise.all([
    prisma.membershipPlan.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { subscriptions: true } },
        // Para saber si la cuota está lista para cobrarse online.
        whopMapping: {
          select: { whopPlanId: true, amount: true, billingPeriodDays: true, currency: true },
        },
      },
    }),
    prisma.subscription.findMany({
      where: { status: { in: SUBSCRIPTION_VISIBLE } },
      include: {
        plan: true,
        member: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    // Socios sin cuota: ni activa ni pendiente de pago. Se excluyen los inactivos
    // y los leads, que aún no son socios de pleno derecho.
    prisma.member.findMany({
      where: {
        status: { notIn: ['INACTIVE', 'LEAD'] },
        subscriptions: { none: { status: { in: SUBSCRIPTION_ACTIVE_LIKE } } },
      },
      select: { id: true, name: true, email: true, phone: true, status: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
  ])

  return NextResponse.json({
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      amount: p.amount,
      currency: p.currency,
      billingPeriod: p.billingPeriod,
      billingPeriodLabel: periodLabel(p.billingPeriod),
      enrollmentFee: p.enrollmentFee,
      paymentRequiredOnEnrollment: p.paymentRequiredOnEnrollment,
      billingDayOfMonth: p.billingDayOfMonth,
      isActive: p.isActive,
      subscriptionCount: p._count.subscriptions,
      // Cobro online: solo cuenta como listo si el plan espejado sigue coincidiendo
      // con el precio y la periodicidad actuales (si no, hay que volver a prepararlo).
      onlineReady: Boolean(
        p.whopMapping &&
          Number(p.whopMapping.amount.toFixed(2)) === Number(p.amount.toFixed(2)) &&
          p.whopMapping.billingPeriodDays === whopBillingPeriodDays(p.billingPeriod) &&
          (p.whopMapping.currency || 'EUR').toLowerCase() ===
            (p.currency || 'EUR').trim().toLowerCase(),
      ),
      updatedAt: p.updatedAt.toISOString(),
    })),
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      status: s.status,
      startDate: s.startDate.toISOString(),
      nextInvoiceDate: s.nextInvoiceDate.toISOString(),
      autoPay: s.autoPay,
      paymentRequiredOnEnrollment: s.paymentRequiredOnEnrollment,
      memberId: s.memberId,
      memberName: s.member.name,
      memberEmail: s.member.email,
      memberPhone: s.member.phone,
      planId: s.planId,
      planName: s.plan.name,
      planAmount: s.plan.amount,
      billingPeriod: s.plan.billingPeriod,
      billingPeriodLabel: periodLabel(s.plan.billingPeriod),
    })),
    membersWithoutPlan: sinCuota.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      status: m.status,
    })),
    stats: {
      activePlans: plans.filter((p) => p.isActive).length,
      activeSubscriptions: subscriptions.filter((s) => s.status === 'ACTIVE').length,
    },
  })
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'El nombre del plan es obligatorio' }, { status: 400 })
  }

  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'Importe inválido' }, { status: 400 })
  }

  const billingPeriod = String(body.billingPeriod || 'MONTHLY').toUpperCase()
  if (!BILLING_PERIODS.includes(billingPeriod as (typeof BILLING_PERIODS)[number])) {
    return NextResponse.json({ error: 'Periodicidad inválida' }, { status: 400 })
  }

  const enrollmentFee = body.enrollmentFee != null ? Number(body.enrollmentFee) : 0
  if (!Number.isFinite(enrollmentFee) || enrollmentFee < 0) {
    return NextResponse.json({ error: 'Matrícula inválida' }, { status: 400 })
  }

  const billingDayOfMonth = clampBillingDay(
    body.billingDayOfMonth != null ? Number(body.billingDayOfMonth) : 1,
  )

  try {
    const plan = await createMembershipPlan({
      name,
      description: typeof body.description === 'string' ? body.description.trim() || undefined : undefined,
      amount,
      billingPeriod,
      enrollmentFee,
      paymentRequiredOnEnrollment: body.paymentRequiredOnEnrollment === true,
      billingDayOfMonth,
    })
    return NextResponse.json({ ok: true, plan: { id: plan.id, name: plan.name } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo crear el plan'
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Ya existe un plan con ese nombre' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown> & { id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Falta id del plan' }, { status: 400 })

  const data: Parameters<typeof updateMembershipPlan>[1] = {}
  if (typeof body.name === 'string') {
    const n = body.name.trim()
    if (!n) return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 })
    data.name = n
  }
  if (typeof body.description === 'string') {
    const d = body.description.trim()
    data.description = d || undefined
  }
  if (body.amount != null) {
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: 'Importe inválido' }, { status: 400 })
    }
    data.amount = amount
  }
  if (body.enrollmentFee != null) {
    const fee = Number(body.enrollmentFee)
    if (!Number.isFinite(fee) || fee < 0) {
      return NextResponse.json({ error: 'Matrícula inválida' }, { status: 400 })
    }
    data.enrollmentFee = fee
  }
  if (typeof body.billingPeriod === 'string') {
    const p = body.billingPeriod.toUpperCase()
    if (!BILLING_PERIODS.includes(p as (typeof BILLING_PERIODS)[number])) {
      return NextResponse.json({ error: 'Periodicidad inválida' }, { status: 400 })
    }
    data.billingPeriod = p
  }
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive
  if (typeof body.paymentRequiredOnEnrollment === 'boolean') {
    data.paymentRequiredOnEnrollment = body.paymentRequiredOnEnrollment
  }
  if (body.billingDayOfMonth != null) {
    data.billingDayOfMonth = clampBillingDay(Number(body.billingDayOfMonth))
  }

  try {
    const plan = await updateMembershipPlan(id, data)
    return NextResponse.json({ ok: true, plan: { id: plan.id } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo actualizar'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

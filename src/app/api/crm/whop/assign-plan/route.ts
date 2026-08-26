import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'
import { runMembersBatchAction } from '@/lib/members-batch-actions'
import { createWhopSubscriptionCheckout } from '@/lib/whop/checkout'
import { SUBSCRIPTION_ACTIVE_LIKE } from '@/lib/subscription-statuses'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Aplica una cuota a uno o varios socios y devuelve el enlace de cobro.
 *
 * Es la versión "de un tirón" de asignar cuota: además de crear la suscripción,
 * genera el enlace de pago para que se le pueda pasar al socio en el momento.
 * Con varios socios el enlace se devuelve solo para el primero (los demás lo
 * recibirán por su flujo de alta o desde su ficha).
 */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  let body: {
    memberIds?: unknown
    planId?: unknown
    paymentRequiredOnEnrollment?: unknown
    discountCodeId?: unknown
    startDate?: unknown
    autoPay?: unknown
    withLink?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const rawIds = Array.isArray(body.memberIds) ? body.memberIds : []
  const memberIds = rawIds.map((v) => String(v || '').trim()).filter(Boolean)
  if (memberIds.length === 0) {
    return NextResponse.json({ error: 'Selecciona al menos un socio.' }, { status: 400 })
  }
  if (memberIds.length > 200) {
    return NextResponse.json({ error: 'Demasiados socios de una vez (máximo 200).' }, { status: 400 })
  }

  const planId = parseCuid(String(body.planId || ''), 'planId')
  if (planId instanceof Response) return planId

  // El descuento se valida contra un código activo. Si el club eligió uno que ya
  // no vale, se rechaza en vez de facturar el importe completo en silencio, que
  // es lo que hacía antes de aceptar este campo.
  let discountCodeId: string | null = null
  const rawDiscount = String(body.discountCodeId || '').trim()
  if (rawDiscount) {
    const parsed = parseCuid(rawDiscount, 'discountCodeId')
    if (parsed instanceof Response) return parsed
    const code = await prisma.discountCode.findUnique({
      where: { id: parsed },
      select: { id: true, isActive: true },
    })
    if (!code || !code.isActive) {
      return NextResponse.json(
        { error: 'Ese descuento ya no está activo. Elige otro o quítalo.' },
        { status: 400 },
      )
    }
    discountCodeId = code.id
  }

  const rawStart = String(body.startDate || '').trim()
  if (rawStart && Number.isNaN(new Date(rawStart).getTime())) {
    return NextResponse.json({ error: 'La fecha de inicio no es válida.' }, { status: 400 })
  }

  const result = await runMembersBatchAction(memberIds, 'assign-plan', {
    planId,
    paymentRequiredOnEnrollment:
      typeof body.paymentRequiredOnEnrollment === 'boolean'
        ? body.paymentRequiredOnEnrollment
        : undefined,
    discountCodeId,
    startDate: rawStart || undefined,
    autoPay: typeof body.autoPay === 'boolean' ? body.autoPay : undefined,
  })

  // Enlace de cobro del primer socio, para poder entregarlo al momento.
  let url: string | null = null
  let linkError: string | null = null
  if (body.withLink !== false && result.succeeded > 0) {
    const subscription = await prisma.subscription.findFirst({
      where: { memberId: memberIds[0], planId, status: { in: SUBSCRIPTION_ACTIVE_LIKE } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (subscription) {
      const link = await createWhopSubscriptionCheckout(subscription.id)
      if (link.ok) url = link.url
      else linkError = link.error
    }
  }

  return NextResponse.json({
    ok: result.ok,
    succeeded: result.succeeded,
    failed: result.failed,
    errors: result.errors,
    url,
    linkError,
  })
}

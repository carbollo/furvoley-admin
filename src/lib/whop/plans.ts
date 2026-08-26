import { prisma } from '@/lib/prisma'
import { whopRequest, WhopError } from '@/lib/whop/client'
import { getWhopClubConfig, getWhopClubCredential } from '@/lib/whop/club-config'

/**
 * Espejo de las cuotas del CRM como planes recurrentes en la pasarela.
 *
 * A diferencia de Stripe (que generaba el precio al vuelo en cada cobro), aquí
 * los planes se crean por adelantado: una cuota del CRM ↔ un plan de la pasarela,
 * guardado en `WhopPlanMapping`.
 *
 * Módulo de servidor puro (sin 'use server'): mueve dinero.
 */

/** La pasarela expresa el periodo en DÍAS (no hay enum mensual/anual). */
export function billingPeriodDays(billingPeriod: string): number {
  switch (String(billingPeriod || '').toUpperCase()) {
    case 'QUARTERLY':
      return 90
    case 'YEARLY':
      return 365
    case 'MONTHLY':
    default:
      return 30
  }
}

type WhopProduct = { id?: unknown }
type WhopPlan = { id?: unknown; purchase_url?: unknown }

export type EnsurePlanResult =
  | { ok: true; planId: string; productId: string; created: boolean }
  | { ok: false; error: string }

/**
 * Devuelve el plan de la pasarela que corresponde a una cuota del CRM, creándolo
 * si hace falta.
 *
 * Si el precio o la periodicidad cambiaron, se crea un plan NUEVO en vez de
 * editar el existente: así los socios ya suscritos siguen con el precio que
 * aceptaron (la doc de la pasarela no garantiza qué pasa con las suscripciones
 * vivas al cambiar el precio de su plan) y los nuevos entran con el nuevo.
 */
export async function ensureWhopPlan(membershipPlanId: string): Promise<EnsurePlanResult> {
  const config = await getWhopClubConfig()
  if (!config.hasCompany) {
    return { ok: false, error: 'La pasarela de cobro no está conectada. Configúrala en Ajustes del club.' }
  }
  const credential = await getWhopClubCredential()
  if (!credential) {
    return { ok: false, error: 'Falta la clave de la pasarela. Vuelve a conectarla en Ajustes del club.' }
  }

  const plan = await prisma.membershipPlan.findUnique({
    where: { id: membershipPlanId },
    include: { whopMapping: true },
  })
  if (!plan) return { ok: false, error: 'Cuota no encontrada.' }
  if (plan.amount <= 0) return { ok: false, error: 'La cuota debe tener un importe mayor que 0.' }
  if (!plan.isActive) return { ok: false, error: 'Esa cuota está desactivada.' }

  const periodDays = billingPeriodDays(plan.billingPeriod)
  const amount = Number(plan.amount.toFixed(2))
  const currency = (plan.currency || 'EUR').trim().toLowerCase()
  const mapping = plan.whopMapping

  // Se reutiliza solo si es de ESTA cuenta y sigue coincidiendo precio, periodo y
  // moneda: un mapeo de una cuenta anterior cobraría en la cuenta equivocada.
  const sameAccount = mapping?.whopCompanyId === config.companyId
  if (
    mapping &&
    sameAccount &&
    Number(mapping.amount.toFixed(2)) === amount &&
    mapping.billingPeriodDays === periodDays &&
    (mapping.currency || 'EUR').trim().toLowerCase() === currency
  ) {
    return { ok: true, planId: mapping.whopPlanId, productId: mapping.whopProductId, created: false }
  }

  try {
    // El producto se reutiliza solo si pertenece a la cuenta activa.
    let productId = sameAccount ? mapping?.whopProductId || '' : ''
    if (!productId) {
      const product = await whopRequest<WhopProduct>({
        method: 'POST',
        path: '/products',
        credential,
        // Clave derivada de la operación (no aleatoria): un reintento de ESTA
        // misma creación se replica en vez de crear un producto duplicado.
        idempotencyKey: `crm:product:${config.companyId}:${plan.id}`,
        body: {
          account_id: config.companyId,
          title: plan.name.slice(0, 80),
          visibility: 'hidden',
          metadata: { crm_plan_id: plan.id },
        },
      })
      productId = String(product?.id ?? '')
      if (!productId) return { ok: false, error: 'La pasarela no devolvió el producto creado.' }
    }

    const created = await whopRequest<WhopPlan>({
      method: 'POST',
      path: '/plans',
      credential,
      // Determinista: incluye precio/periodo/moneda, así un reintento se replica
      // pero un cambio de precio genera de forma natural una clave nueva.
      idempotencyKey: `crm:plan:${config.companyId}:${plan.id}:${amount}:${periodDays}:${currency}`,
      body: {
        account_id: config.companyId,
        product_id: productId,
        plan_type: 'renewal',
        // Moneda SIEMPRE en minúsculas: si se omite, la pasarela cobra en USD.
        currency,
        // Solo `renewal_price`: en un plan recurrente el `initial_price` se cobra
        // ADEMÁS del primer periodo (la primera cuota saldría por el doble).
        renewal_price: amount,
        billing_period: periodDays,
        // Interno del CRM: no debe aparecer en la tienda pública del club.
        visibility: 'hidden',
        release_method: 'buy_now',
        title: plan.name.slice(0, 30),
        metadata: { crm_plan_id: plan.id },
      },
    })

    const whopPlanId = String(created?.id ?? '')
    if (!whopPlanId) return { ok: false, error: 'La pasarela no devolvió el plan creado.' }

    await prisma.whopPlanMapping.upsert({
      where: { membershipPlanId: plan.id },
      create: {
        membershipPlanId: plan.id,
        whopCompanyId: config.companyId,
        whopProductId: productId,
        whopPlanId,
        amount,
        currency,
        billingPeriodDays: periodDays,
      },
      update: {
        whopCompanyId: config.companyId,
        whopProductId: productId,
        whopPlanId,
        amount,
        currency,
        billingPeriodDays: periodDays,
      },
    })

    return { ok: true, planId: whopPlanId, productId, created: true }
  } catch (e) {
    if (e instanceof WhopError && e.status === 403) {
      return {
        ok: false,
        error: 'La clave de la pasarela no tiene permiso para crear planes. Genera una nueva con el rol «Admin».',
      }
    }
    console.error('[whop/plans] ensureWhopPlan', membershipPlanId, e)
    return { ok: false, error: 'No se pudo preparar la cuota en la pasarela. Inténtalo de nuevo.' }
  }
}

export type SyncResult = { synced: number; created: number; errors: { plan: string; error: string }[] }

/** Sincroniza TODAS las cuotas activas del club con la pasarela. */
export async function syncAllWhopPlans(): Promise<SyncResult> {
  const plans = await prisma.membershipPlan.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  const out: SyncResult = { synced: 0, created: 0, errors: [] }
  for (const p of plans) {
    const r = await ensureWhopPlan(p.id)
    if (r.ok) {
      out.synced += 1
      if (r.created) out.created += 1
    } else {
      out.errors.push({ plan: p.name, error: r.error })
    }
  }
  return out
}

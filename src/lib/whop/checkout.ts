import { prisma } from '@/lib/prisma'
import { buildTenantPublicUrl } from '@/lib/public-url'
import { currentTenant } from '@/lib/multitenant/context'
import { SUBSCRIPTION_ACTIVE_LIKE } from '@/lib/subscription-statuses'
import { whopRequest, WhopError } from '@/lib/whop/client'
import { getWhopClubConfig, getWhopClubCredential, getWhopClubWebhookSecret } from '@/lib/whop/club-config'
import { ensureWhopPlan } from '@/lib/whop/plans'

/**
 * Enlaces de pago de la pasarela. Dos modos:
 *  - **Suscripción**: cobra la cuota del socio de forma recurrente (plan espejo).
 *  - **Factura puntual**: cobra un importe suelto una sola vez.
 *
 * En ambos se adjunta `metadata` con los ids del CRM: la pasarela la copia al
 * pago y la reenvía en el webhook, que es como se concilia cada cobro con su
 * factura sin depender de importes ni fechas.
 *
 * Módulo de servidor puro (sin 'use server'): mueve dinero.
 */

export type CheckoutResult = { ok: true; url: string; checkoutId: string } | { ok: false; error: string }

type WhopCheckout = { id?: unknown; purchase_url?: unknown; plan?: { id?: unknown } }

/**
 * URL de vuelta tras pagar, EN EL DOMINIO DEL CLUB: si se usara la base común,
 * el socio aterrizaría en el login de otro club y creería que el pago falló.
 * Se construye con `URL` porque el helper de tenant puede traer ya su propio
 * parámetro (`?tenant=`) cuando no hay dominio comodín.
 */
function returnUrl(path: string, params: Record<string, string>): string {
  const raw = buildTenantPublicUrl(path)
  try {
    const u = new URL(raw)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    return u.toString()
  } catch {
    return raw
  }
}

/** Mensaje de error para el usuario, sin filtrar detalles internos de la pasarela. */
function friendlyError(e: unknown, fallback: string): string {
  if (e instanceof WhopError && e.status === 403) {
    return 'La clave de la pasarela no tiene permiso para cobrar. Genera una nueva con el rol «Admin».'
  }
  if (e instanceof WhopError && e.status === 401) {
    return 'La clave de la pasarela ya no es válida. Vuelve a conectarla en Ajustes del club.'
  }
  return fallback
}

/** Comprueba que el club puede cobrar y devuelve sus credenciales. */
async function chargingContext() {
  const config = await getWhopClubConfig()
  if (!config.hasCompany) {
    return { ok: false as const, error: 'La pasarela de cobro no está conectada. Configúrala en Ajustes del club.' }
  }
  const credential = await getWhopClubCredential()
  if (!credential) {
    return { ok: false as const, error: 'Falta la clave de la pasarela. Vuelve a conectarla en Ajustes del club.' }
  }
  // Sin avisos de cobro, un pago no llegaría al CRM: el socio pagaría y la
  // factura seguiría reclamándose. Mejor no cobrar que cobrar sin conciliar.
  const webhookSecret = await getWhopClubWebhookSecret()
  if (!webhookSecret) {
    return {
      ok: false as const,
      error:
        'Los avisos de cobro de la pasarela no están activos, así que los pagos no se registrarían. El administrador debe reconectar la pasarela en Ajustes del club.',
    }
  }
  return { ok: true as const, config, credential }
}

/**
 * Enlace de pago para una FACTURA PUNTUAL (cobro único del importe pendiente).
 * Se cachea en la factura para no generar un enlace nuevo en cada visita.
 */
export async function createWhopInvoiceCheckout(invoiceId: string): Promise<CheckoutResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { member: true },
  })
  if (!invoice) return { ok: false, error: 'Factura no encontrada.' }

  if (invoice.status === 'VOID') {
    return { ok: false, error: 'Esta factura está anulada.' }
  }
  if (invoice.status === 'PAID') {
    return { ok: false, error: 'Esta factura ya está pagada.' }
  }

  const pending = Number(Math.max(0, invoice.totalAmount - invoice.paidAmount).toFixed(2))
  if (pending <= 0) return { ok: false, error: 'Esta factura ya está pagada.' }
  if (pending < 0.5) {
    return { ok: false, error: 'El importe pendiente es demasiado bajo para cobrarlo online.' }
  }

  // El enlace cacheado cobra SIEMPRE el importe con el que se creó: solo se
  // reutiliza si sigue coincidiendo con lo que se debe hoy (un pago parcial o una
  // edición de la factura lo invalidan; si no, cobraría de más).
  if (invoice.whopCheckoutUrl?.startsWith('https://') && invoice.whopCheckoutAmount === pending) {
    return { ok: true, url: invoice.whopCheckoutUrl, checkoutId: invoice.whopCheckoutId || '' }
  }

  const ctx = await chargingContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  try {
    const checkout = await whopRequest<WhopCheckout>({
      method: 'POST',
      path: '/checkout_configurations',
      credential: ctx.credential,
      // Determinista por factura+importe: un reintento se replica en vez de crear
      // un segundo enlace vivo, y un importe distinto genera clave nueva sola.
      idempotencyKey: `crm:invoice:${invoice.id}:${pending}:${(invoice.currency || 'EUR').toLowerCase()}`,
      body: {
        account_id: ctx.config.companyId,
        mode: 'payment',
        plan: {
          plan_type: 'one_time',
          currency: (invoice.currency || 'EUR').trim().toLowerCase(),
          initial_price: pending,
          title: `Factura ${invoice.invoiceNumber}`.slice(0, 30),
          visibility: 'hidden',
          release_method: 'buy_now',
          // Sin esto la pasarela REUTILIZA un plan existente que coincida en
          // importe: dos facturas distintas del mismo importe compartirían plan.
          force_create_new_plan: true,
        },
        // La pasarela copia esta metadata al pago y la manda en el webhook.
        metadata: {
          invoice_id: invoice.id,
          member_id: invoice.memberId,
          club_slug: currentTenant()?.slug || '',
        },
        redirect_url: returnUrl('/my-billing', { pago: 'ok' }),
      },
    })

    const url = String(checkout?.purchase_url ?? '')
    const checkoutId = String(checkout?.id ?? '')
    if (!url) return { ok: false, error: 'La pasarela no devolvió el enlace de pago.' }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { whopCheckoutUrl: url, whopCheckoutId: checkoutId, whopCheckoutAmount: pending },
    })

    return { ok: true, url, checkoutId }
  } catch (e) {
    console.error('[whop/checkout] invoice', invoiceId, e)
    return { ok: false, error: friendlyError(e, 'No se pudo generar el enlace de pago. Inténtalo de nuevo.') }
  }
}

/**
 * Enlace de alta de SUSCRIPCIÓN: el socio paga su cuota y la pasarela la renueva
 * automáticamente cada periodo. El webhook irá emitiendo la factura de cada
 * renovación en el CRM.
 */
export async function createWhopSubscriptionCheckout(subscriptionId: string): Promise<CheckoutResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { member: true, plan: true },
  })
  if (!subscription) return { ok: false, error: 'Suscripción no encontrada.' }
  // Se permite generar el enlace de una cuota PENDIENTE DE PAGO: es justo la que
  // necesita cobrarse. Exigir que estuviera activa sería un círculo cerrado (sin
  // enlace no hay pago, y sin pago nunca se activa).
  if (!SUBSCRIPTION_ACTIVE_LIKE.includes(subscription.status as never)) {
    return { ok: false, error: 'Esa cuota está pausada o cancelada: reactívala antes de cobrarla.' }
  }
  if (!subscription.plan.isActive) {
    return { ok: false, error: 'La cuota asignada está desactivada.' }
  }
  if (subscription.whopMembershipId) {
    return { ok: false, error: 'Este socio ya tiene el cobro recurrente activo.' }
  }

  const ctx = await chargingContext()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const mapped = await ensureWhopPlan(subscription.planId)
  if (!mapped.ok) return { ok: false, error: mapped.error }

  try {
    const checkout = await whopRequest<WhopCheckout>({
      method: 'POST',
      path: '/checkout_configurations',
      credential: ctx.credential,
      idempotencyKey: `crm:sub:${subscription.id}:${mapped.planId}`,
      body: {
        account_id: ctx.config.companyId,
        // `payment` = cobrar ahora (frente a `setup`, que solo guarda la tarjeta).
        // La recurrencia la marca el plan (`renewal`), no este campo.
        mode: 'payment',
        plan_id: mapped.planId,
        metadata: {
          subscription_id: subscription.id,
          member_id: subscription.memberId,
          crm_plan_id: subscription.planId,
          club_slug: currentTenant()?.slug || '',
        },
        redirect_url: returnUrl('/my-billing', { alta: 'ok' }),
      },
    })

    const url = String(checkout?.purchase_url ?? '')
    const checkoutId = String(checkout?.id ?? '')
    if (!url) return { ok: false, error: 'La pasarela no devolvió el enlace de alta.' }

    return { ok: true, url, checkoutId }
  } catch (e) {
    console.error('[whop/checkout] subscription', subscriptionId, e)
    return { ok: false, error: friendlyError(e, 'No se pudo generar el enlace de alta. Inténtalo de nuevo.') }
  }
}

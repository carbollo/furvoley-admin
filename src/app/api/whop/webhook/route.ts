import { NextResponse } from 'next/server'
import { withTenant } from '@/lib/multitenant/context'
import { isMultiTenant, tenantDbUrl } from '@/lib/multitenant/registry'
import { findTenantByWhopCompany, SINGLE_CLUB } from '@/lib/whop/company-claim'
import { readWhopClubCompanyId, readWhopClubWebhookSecret } from '@/lib/whop/club-config'
import { verifyWhopSignature, MAX_SKEW_SECONDS } from '@/lib/whop/webhook-verify'
import {
  reconcilePaymentSucceeded,
  reconcilePaymentFailed,
  reconcileMembershipEnded,
  parkEvent,
  type PaymentData,
} from '@/lib/whop/reconcile'

export const dynamic = 'force-dynamic'

type Envelope = {
  id?: unknown
  type?: unknown
  action?: unknown
  /** Cuenta de la pasarela que origina el evento (antes se llamaba `company_id`). */
  account_id?: unknown
  company_id?: unknown
  data?: Record<string, unknown>
}

/** Eventos que representan un cobro real: si no se concilian, hay que reintentar. */
const MONEY_EVENTS = new Set(['payment.succeeded', 'payment.failed'])

/**
 * Webhook de la pasarela de cobro: es lo que hace que un pago del socio se refleje
 * en el CRM (factura pagada, socio activado, cuota renovada).
 *
 * Multi-tenant: el evento dice de qué CUENTA viene; el directorio del portal
 * traduce esa cuenta a un club y la conciliación corre dentro de la BD de ese club
 * (`withTenant`). Nunca se confía en nada del cuerpo para elegir el club.
 *
 * Seguridad: firma HMAC verificada con el secreto DEL CLUB, sobre el cuerpo crudo y
 * en tiempo constante. Sin firma válida no se procesa nada.
 *
 * Códigos: 2xx = procesado o descartado a propósito; 5xx = reintenta (hay dinero en
 * juego y no se ha podido registrar); 401 = firma inválida.
 */
export async function POST(request: Request) {
  // Comprobación barata ANTES de tocar ninguna BD: sin cabeceras de firma no hay
  // nada que hacer, y así una petición anónima no llega a abrir conexiones.
  const webhookId = request.headers.get('webhook-id')
  const timestamp = request.headers.get('webhook-timestamp')
  const signature = request.headers.get('webhook-signature')
  if (!webhookId || !timestamp || !signature) {
    return NextResponse.json({ error: 'Firma ausente' }, { status: 401 })
  }
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > MAX_SKEW_SECONDS) {
    return NextResponse.json({ error: 'Firma no válida' }, { status: 401 })
  }

  const rawBody = await request.text()

  let envelope: Envelope
  try {
    envelope = JSON.parse(rawBody) as Envelope
  } catch {
    return NextResponse.json({ error: 'Cuerpo no válido' }, { status: 400 })
  }

  const companyId =
    String(envelope.account_id ?? '').trim() || String(envelope.company_id ?? '').trim()
  if (!companyId) {
    return NextResponse.json({ error: 'Evento sin cuenta de origen' }, { status: 400 })
  }

  const lookup = await findTenantByWhopCompany(companyId)
  if (lookup.status === 'unavailable') {
    // No se sabe de quién es el cobro: 503 para que la pasarela lo reintente.
    // Responder 200 aquí perdería el pago para siempre.
    return NextResponse.json({ error: 'Directorio no disponible' }, { status: 503 })
  }
  if (lookup.status === 'not_found') {
    // Misma respuesta que una firma inválida, para no revelar qué cuentas existen.
    return NextResponse.json({ error: 'Firma no válida' }, { status: 401 })
  }

  const slug = lookup.slug
  const dbUrl = slug === SINGLE_CLUB ? null : tenantDbUrl(slug)
  if (isMultiTenant() && !dbUrl) {
    return NextResponse.json({ error: 'Club no resoluble' }, { status: 503 })
  }

  const run = async () => {
    // En un-solo-club el evento no trae club: se comprueba que la cuenta es la suya.
    if (slug === SINGLE_CLUB) {
      const own = await readWhopClubCompanyId()
      // Un fallo de lectura NO es un evento ajeno: 503 para que se reintente.
      if (own.status === 'unavailable') {
        return NextResponse.json({ error: 'No disponible' }, { status: 503 })
      }
      if (own.value !== companyId) {
        return NextResponse.json({ error: 'Firma no válida' }, { status: 401 })
      }
    }

    const secret = await readWhopClubWebhookSecret()
    if (secret.status === 'unavailable') {
      return NextResponse.json({ error: 'No disponible' }, { status: 503 })
    }
    const verification = verifyWhopSignature({
      rawBody,
      secret: secret.value,
      webhookId,
      timestamp,
      signature,
    })
    if (!verification.ok) {
      console.warn('[whop/webhook] firma rechazada', { slug, reason: verification.reason })
      return NextResponse.json({ error: 'Firma no válida' }, { status: 401 })
    }

    // Solo a partir de aquí el evento es de confianza.
    const type = String(envelope.type ?? envelope.action ?? '')
    const data = (envelope.data || {}) as Record<string, unknown>
    const payment = data as PaymentData

    try {
      let outcome
      if (type === 'payment.succeeded') {
        outcome = await reconcilePaymentSucceeded(payment)
      } else if (type === 'payment.failed') {
        outcome = await reconcilePaymentFailed(payment)
      } else if (
        type === 'membership.went_invalid' ||
        type === 'membership.deactivated' ||
        type === 'membership.canceled'
      ) {
        outcome = await reconcileMembershipEnded(data as { id?: unknown })
      } else {
        outcome = { handled: true, detail: `evento no usado (${type})` }
      }

      // Un cobro que no se ha podido aplicar NO se descarta: se guarda para que
      // alguien lo resuelva. Al otro lado hay un socio que ya ha pagado.
      if ((!outcome.handled || outcome.parked) && MONEY_EVENTS.has(type)) {
        await parkEvent({ eventType: type, payment, reason: outcome.detail, payload: envelope })
        console.warn('[whop/webhook] evento aparcado', slug, type, outcome.detail)
      }

      return NextResponse.json({ ok: true, handled: outcome.handled })
    } catch (e) {
      // 5xx para que la pasarela reintente: el cobro existe y hay que registrarlo.
      // Y se aparca igualmente: si los reintentos se agotan, el cobro tiene que
      // quedar registrado en algún sitio donde una persona pueda verlo.
      console.error('[whop/webhook] fallo al conciliar', slug, type, e)
      if (MONEY_EVENTS.has(type)) {
        await parkEvent({
          eventType: type,
          payment,
          reason: `error al conciliar: ${e instanceof Error ? e.message : 'desconocido'}`,
          payload: envelope,
        })
      }
      return NextResponse.json({ error: 'Error al procesar el evento' }, { status: 500 })
    }
  }

  return dbUrl ? withTenant({ slug, dbUrl }, run) : run()
}

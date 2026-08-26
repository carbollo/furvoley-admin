import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { isPortalCentralHost, getPortalPublicUrl, getTenantBaseDomain } from '@/lib/portal-central/config'
import { findPlanByWebhookToken, logPortalAudit } from '@/lib/portal-central/portal-store'
import {
  provisionClubFromSubscription,
  changeClubPlan,
  cancelClub,
  markClubPaymentFailed,
  markClubPaymentOk,
} from '@/lib/portal-central/provision-club'
import { sendWelcomeEmail } from '@/lib/portal-central/mailer'
import { clientIpFromHeaders } from '@/lib/login-rate-limit'
import { checkWebhookRate, tryAcquireProvisionSlot, releaseProvisionSlot } from '@/lib/portal-central/webhook-limit'

export const dynamic = 'force-dynamic'

type AnyObj = Record<string, unknown>

/** Primer valor string no vacío entre varias claves candidatas de un objeto. */
function pick(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== 'object') return ''
  const o = obj as AnyObj
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** Lee la firma HMAC de las cabeceras habituales y le quita el prefijo `sha256=`. */
function extractSignature(headers: Headers): string {
  const raw =
    headers.get('x-webhook-signature') ||
    headers.get('x-signature') ||
    headers.get('x-hub-signature-256') ||
    headers.get('x-hmac-signature') ||
    ''
  return raw.trim().replace(/^sha256=/i, '').trim()
}

/** Verifica que `sigHex` es el HMAC-SHA256 de `rawBody` con `secret` (comparación
 *  en tiempo constante). Devuelve false si falta la firma o no coincide. */
function verifyHmac(rawBody: string, secret: string, sigHex: string): boolean {
  if (!sigHex || !/^[a-f0-9]+$/i.test(sigHex)) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(sigHex, 'hex')
  if (a.length === 0 || a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

type WebhookEvent = 'create' | 'update' | 'cancel' | 'payment_failed' | 'payment_ok'

/**
 * Clasifica el tipo de evento a partir del cuerpo (la tienda manda `type`/`event`/
 * `action`/`status`…). Tolerante: sin tipo o desconocido → `create` (comportamiento
 * original, para no romper integraciones que solo mandan altas).
 */
function classifyEvent(body: unknown): WebhookEvent {
  const raw = pick(body, ['type', 'event', 'event_type', 'eventType', 'action', 'topic', 'status']).toLowerCase()
  if (!raw) return 'create'
  const has = (...ks: string[]) => ks.some((k) => raw.includes(k))
  // Orden importa: primero los específicos de pago (no confundir con create/cancel).
  if (has('payment_failed', 'payment.failed', 'payment_declined', 'declined', 'past_due', 'unpaid', 'dunning')) return 'payment_failed'
  if (has('payment_succeeded', 'payment.succeeded', 'invoice.paid', 'invoice_paid', 'renewed', 'recovered', 'reactivat')) return 'payment_ok'
  // 'ended' anclado ('.ended'/'_ended') para no capturar 'extended'.
  if (has('cancel', 'deleted', 'expired', 'revoked', 'refund', 'chargeback', '.ended', '_ended', 'terminated', 'suspend')) return 'cancel'
  if (has('updated', 'update', 'changed', 'upgrade', 'downgrade', 'switch', 'modified', 'plan_change')) return 'update'
  return 'create'
}

/** URL de acceso para el nuevo club: portal /portal, o el subdominio del club. */
function clubLoginUrl(slug: string): string {
  const portal = getPortalPublicUrl().replace(/\/+$/, '')
  if (portal) return `${portal}/portal`
  const base = getTenantBaseDomain()
  if (base) return `https://${slug}.${base}/login`
  return '/portal'
}

/**
 * Webhook de alta automática desde una tienda externa. Cada PLAN tiene su token en
 * la URL; la tienda envía el evento de suscripción (JSON con al menos el email del
 * cliente). El sistema da de alta un CLUB nuevo completo en ese plan (Tenant + BD +
 * admin), genera una contraseña de 24 chars y la envía por SMTP. Idempotente por
 * email. Auth: el propio token (aleatorio, 48 hex) de la URL.
 */
async function run(request: Request, token: string) {
  if (!isPortalCentralHost()) {
    return NextResponse.json({ error: 'Este webhook solo existe en el servicio portal.' }, { status: 404 })
  }
  const plan = await findPlanByWebhookToken(token)
  if (!plan) {
    return NextResponse.json({ error: 'Webhook no válido o revocado.' }, { status: 404 })
  }

  // Rate-limit por token: frena el flood que agotaría el portal con altas pesadas.
  const rl = checkWebhookRate(token)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Demasiadas altas en poco tiempo. Reintenta más tarde.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  // Se lee el cuerpo CRUDO (una sola vez): necesario para verificar la firma HMAC
  // sobre los bytes exactos que firmó la tienda antes de parsear.
  const rawBody = await request.text()

  // Firma HMAC opcional POR PLAN: si el plan tiene secreto, se EXIGE firma válida
  // (defensa contra un token filtrado). Sin secreto → no se exige (retrocompatible).
  if (plan.webhookSecret) {
    if (!verifyHmac(rawBody, plan.webhookSecret, extractSignature(request.headers))) {
      return NextResponse.json({ error: 'Firma del webhook ausente o inválida.' }, { status: 401 })
    }
  }

  let body: AnyObj = {}
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as AnyObj
    } catch {
      // Algunas tiendas envían form-urlencoded; se parsea el mismo cuerpo crudo.
      try {
        body = Object.fromEntries(new URLSearchParams(rawBody)) as AnyObj
      } catch {
        body = {}
      }
    }
  }

  const email =
    pick(body, ['email', 'customer_email', 'customerEmail', 'buyer_email', 'buyerEmail', 'user_email']) ||
    pick(body.customer, ['email']) ||
    pick(body.buyer, ['email']) ||
    pick(body.data, ['email', 'customer_email'])
  const clubName =
    pick(body, ['clubName', 'club', 'company', 'businessName', 'name', 'customerName', 'buyer_name', 'full_name']) ||
    pick(body.customer, ['name', 'company']) ||
    ''

  if (!email) {
    return NextResponse.json({ error: 'El evento no incluye el email del cliente.' }, { status: 400 })
  }

  const ip = clientIpFromHeaders(request.headers)
  const eventType = classifyEvent(body)

  // ── Eventos "ligeros" sobre un club YA existente ────────────────────────────
  // No aprovisionan (no pasan por el semáforo): solo tocan la BD del portal.
  if (eventType === 'cancel') {
    const r = await cancelClub(email)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
    await logPortalAudit({ actor: 'webhook', action: 'WEBHOOK_CANCEL', tenantSlug: r.found ? r.tenantSlug : null, tenantName: r.found ? r.tenantName : null, targetType: 'PLAN', targetId: plan.id, detail: { email, plan: plan.name, found: r.found }, ip })
    return NextResponse.json({ ok: true, event: 'cancel', found: r.found, ...(r.found ? { tenant: { slug: r.tenantSlug, name: r.tenantName } } : {}) })
  }
  if (eventType === 'payment_failed') {
    const r = await markClubPaymentFailed(email)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
    await logPortalAudit({ actor: 'webhook', action: 'WEBHOOK_PAYMENT_FAILED', tenantSlug: r.found ? r.tenantSlug : null, tenantName: r.found ? r.tenantName : null, targetType: 'PLAN', targetId: plan.id, detail: { email, plan: plan.name, found: r.found }, ip })
    return NextResponse.json({ ok: true, event: 'payment_failed', found: r.found })
  }
  if (eventType === 'payment_ok') {
    const r = await markClubPaymentOk(email)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
    await logPortalAudit({ actor: 'webhook', action: 'WEBHOOK_PAYMENT_OK', tenantSlug: r.found ? r.tenantSlug : null, tenantName: r.found ? r.tenantName : null, targetType: 'PLAN', targetId: plan.id, detail: { email, plan: plan.name, found: r.found }, ip })
    return NextResponse.json({ ok: true, event: 'payment_ok', found: r.found })
  }
  if (eventType === 'update') {
    const r = await changeClubPlan(email, plan.id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
    if (r.found) {
      await logPortalAudit({ actor: 'webhook', action: 'WEBHOOK_PLAN_CHANGE', tenantSlug: r.tenantSlug, tenantName: r.tenantName, targetType: 'PLAN', targetId: plan.id, detail: { email, plan: plan.name }, ip })
      return NextResponse.json({ ok: true, event: 'update', tenant: { slug: r.tenantSlug, name: r.tenantName }, plan: plan.name })
    }
    // No existe el club: se trata como alta (recuperación) → sigue al flujo de create.
  }

  // ── Alta (create, o update de un email sin club) → aprovisiona club nuevo ────
  // Concurrencia acotada: el aprovisionamiento (CREATE DATABASE + prisma db push) es
  // pesado; si ya hay demasiados en curso, se rechaza para no tumbar el portal.
  if (!tryAcquireProvisionSlot()) {
    return NextResponse.json(
      { error: 'Aprovisionamiento saturado, reintenta en unos segundos.' },
      { status: 503, headers: { 'Retry-After': '10' } },
    )
  }
  let result
  try {
    result = await provisionClubFromSubscription({ planId: plan.id, email, clubName })
  } finally {
    releaseProvisionSlot()
  }
  if (!result.ok) {
    // El log del aprovisionamiento (salida de prisma db push) puede exponer host/BD
    // internos: se registra en el servidor pero NO se devuelve al cliente.
    if (result.log) console.error('[webhook subscription] provision log:', result.log)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Alta EN CURSO para este email (otra entrega la está aprovisionando): NO se declara
  // éxito idempotente (podría fallar y revertir); se pide reintento a la tienda.
  if ('pending' in result) {
    return NextResponse.json(
      { ok: false, pending: true, message: 'Alta en curso para este email; reintenta en unos segundos.' },
      { status: 503, headers: { 'Retry-After': '15' } },
    )
  }

  if (result.alreadyProvisioned) {
    await logPortalAudit({
      actor: 'webhook',
      action: 'WEBHOOK_SUBSCRIPTION_DUP',
      tenantSlug: result.tenantSlug,
      tenantName: result.tenantName,
      targetType: 'PLAN',
      targetId: plan.id,
      detail: { email, plan: plan.name },
      ip,
    })
    return NextResponse.json({ ok: true, idempotent: true, message: 'Ese email ya tenía un club; no se ha duplicado.' })
  }

  let emailed = false
  let emailError: string | undefined
  try {
    await sendWelcomeEmail({
      to: email,
      clubName: result.tenantName,
      loginUrl: clubLoginUrl(result.tenantSlug),
      email,
      password: result.password,
      planName: plan.name,
    })
    emailed = true
  } catch (e) {
    emailError = e instanceof Error ? e.message : 'error SMTP'
    console.error('[webhook subscription] SMTP:', emailError)
  }

  await logPortalAudit({
    actor: 'webhook',
    action: 'WEBHOOK_SUBSCRIPTION',
    tenantSlug: result.tenantSlug,
    tenantName: result.tenantName,
    targetType: 'TENANT',
    targetId: result.tenantId,
    detail: { email, plan: plan.name, emailed },
    ip,
  })

  // El club queda creado aunque el email falle; el super-admin puede "Reenviar acceso".
  return NextResponse.json({
    ok: true,
    tenant: { slug: result.tenantSlug, name: result.tenantName },
    plan: plan.name,
    emailed,
    // No se devuelve el error crudo de SMTP (host/relay internos): solo va a console.error.
    ...(emailed ? {} : { note: 'Club creado pero el email de bienvenida falló; usa "Reenviar acceso" en el panel.' }),
  })
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  return run(request, token)
}

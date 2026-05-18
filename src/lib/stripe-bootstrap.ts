/**
 * Bootstrap automático de los WebhookEndpoints de Stripe.
 *
 * Objetivo: que un clon nuevo del servicio en Railway pueda funcionar sin que
 * el operador tenga que crear manualmente los webhooks en el Dashboard de
 * Stripe. La función `ensureStripeWebhooks` es idempotente:
 *
 *  - Detecta la URL pública del servicio (`NEXT_PUBLIC_APP_URL` o
 *    `RAILWAY_PUBLIC_DOMAIN`).
 *  - Si la BD ya tiene los IDs+secrets y la URL coincide → no hace nada.
 *  - Si tiene IDs pero la URL ha cambiado → actualiza los endpoints en
 *    Stripe (`update`), conservando los secrets.
 *  - Si no hay IDs → crea ambos endpoints (`platform` y `connect`) y guarda
 *    los `whsec_…` en BD.
 *
 * Los secrets persistidos en BD son el fallback del verificador de firma del
 * webhook cuando `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET` no
 * están configurados como env vars.
 */
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import type Stripe from 'stripe'

export const REQUIRED_WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'payment_intent.payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]

/**
 * Devuelve la base pública del servicio (sin slash final), o `null` si no se
 * pudo detectar. Prioridad:
 *   1. `NEXT_PUBLIC_APP_URL` (config explícita).
 *   2. `RAILWAY_PUBLIC_DOMAIN` (auto-poblada por Railway).
 *   3. `VERCEL_URL` (por si en algún momento se despliega allí).
 */
export function detectPublicBaseUrl(): string | null {
  const explicit = (process.env.NEXT_PUBLIC_APP_URL || '').trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  const railway = (process.env.RAILWAY_PUBLIC_DOMAIN || '').trim()
  if (railway) {
    const url = railway.startsWith('http') ? railway : `https://${railway}`
    return url.replace(/\/+$/, '')
  }

  const vercel = (process.env.VERCEL_URL || '').trim()
  if (vercel) {
    const url = vercel.startsWith('http') ? vercel : `https://${vercel}`
    return url.replace(/\/+$/, '')
  }

  return null
}

export function detectWebhookUrl(): string | null {
  const base = detectPublicBaseUrl()
  return base ? `${base}/api/stripe/webhook` : null
}

export type StripeBootstrapStatus = {
  ok: boolean
  configured: boolean
  publicUrl: string | null
  webhookUrl: string | null
  platformWebhookId: string | null
  connectWebhookId: string | null
  hasPlatformSecret: boolean
  hasConnectSecret: boolean
  envOverridesPlatform: boolean
  envOverridesConnect: boolean
  lastSyncedAt: string | null
  error: string | null
}

async function getRow() {
  const existing = await prisma.stripeBootstrap.findUnique({ where: { isDefault: true } })
  if (existing) return existing
  return prisma.stripeBootstrap.create({ data: { isDefault: true } })
}

/** Estado actual sin disparar llamadas a Stripe. */
export async function getStripeBootstrapStatus(): Promise<StripeBootstrapStatus> {
  let row
  try {
    row = await getRow()
  } catch (e) {
    return {
      ok: false,
      configured: false,
      publicUrl: null,
      webhookUrl: null,
      platformWebhookId: null,
      connectWebhookId: null,
      hasPlatformSecret: false,
      hasConnectSecret: false,
      envOverridesPlatform: !!process.env.STRIPE_WEBHOOK_SECRET,
      envOverridesConnect: !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
      lastSyncedAt: null,
      error: (e as Error).message,
    }
  }
  return {
    ok: !row.lastError,
    configured: !!(row.platformWebhookSecret && row.connectWebhookSecret),
    publicUrl: detectPublicBaseUrl(),
    webhookUrl: detectWebhookUrl(),
    platformWebhookId: row.platformWebhookId,
    connectWebhookId: row.connectWebhookId,
    hasPlatformSecret: !!row.platformWebhookSecret,
    hasConnectSecret: !!row.connectWebhookSecret,
    envOverridesPlatform: !!process.env.STRIPE_WEBHOOK_SECRET,
    envOverridesConnect: !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    error: row.lastError ?? null,
  }
}

/**
 * Devuelve los secrets persistidos para verificar firmas cuando las env vars
 * no están definidas. No dispara ninguna llamada a Stripe.
 */
export async function getPersistedWebhookSecrets(): Promise<{
  platform: string | null
  connect: string | null
}> {
  try {
    const row = await prisma.stripeBootstrap.findUnique({ where: { isDefault: true } })
    return {
      platform: row?.platformWebhookSecret ?? null,
      connect: row?.connectWebhookSecret ?? null,
    }
  } catch {
    return { platform: null, connect: null }
  }
}

/**
 * Garantiza que los WebhookEndpoints existen en Stripe apuntando a la URL
 * actual del servicio. Idempotente; seguro para llamar en background.
 */
export async function ensureStripeWebhooks(): Promise<StripeBootstrapStatus> {
  if (!process.env.STRIPE_SECRET_KEY) {
    await markError('STRIPE_SECRET_KEY no está configurada')
    return getStripeBootstrapStatus()
  }

  const webhookUrl = detectWebhookUrl()
  if (!webhookUrl) {
    await markError('No se pudo detectar la URL pública (NEXT_PUBLIC_APP_URL / RAILWAY_PUBLIC_DOMAIN).')
    return getStripeBootstrapStatus()
  }

  const stripe = getStripe()
  let row = await getRow()

  // Si todo coincide, no hagas nada.
  if (
    row.publicUrl === webhookUrl &&
    row.platformWebhookId &&
    row.connectWebhookId &&
    row.platformWebhookSecret &&
    row.connectWebhookSecret &&
    !row.lastError
  ) {
    return getStripeBootstrapStatus()
  }

  try {
    // PLATFORM endpoint
    let platformId = row.platformWebhookId
    let platformSecret = row.platformWebhookSecret
    if (platformId) {
      // Reusar: actualizar URL/eventos por si han cambiado.
      try {
        await stripe.webhookEndpoints.update(platformId, {
          url: webhookUrl,
          enabled_events: REQUIRED_WEBHOOK_EVENTS,
          description: 'Furvoley CRM — platform events (auto)',
        })
      } catch (err) {
        // Si el endpoint guardado ya no existe, créalo de nuevo.
        if (isMissingResource(err)) {
          platformId = null
          platformSecret = null
        } else {
          throw err
        }
      }
    }
    if (!platformId) {
      const created = await stripe.webhookEndpoints.create({
        url: webhookUrl,
        enabled_events: REQUIRED_WEBHOOK_EVENTS,
        connect: false,
        description: 'Furvoley CRM — platform events (auto)',
      })
      platformId = created.id
      platformSecret = created.secret ?? null
    }

    // CONNECT endpoint
    let connectId = row.connectWebhookId
    let connectSecret = row.connectWebhookSecret
    if (connectId) {
      try {
        await stripe.webhookEndpoints.update(connectId, {
          url: webhookUrl,
          enabled_events: REQUIRED_WEBHOOK_EVENTS,
          description: 'Furvoley CRM — Connect events (auto)',
        })
      } catch (err) {
        if (isMissingResource(err)) {
          connectId = null
          connectSecret = null
        } else {
          throw err
        }
      }
    }
    if (!connectId) {
      const created = await stripe.webhookEndpoints.create({
        url: webhookUrl,
        enabled_events: REQUIRED_WEBHOOK_EVENTS,
        connect: true,
        description: 'Furvoley CRM — Connect events (auto)',
      })
      connectId = created.id
      connectSecret = created.secret ?? null
    }

    row = await prisma.stripeBootstrap.update({
      where: { isDefault: true },
      data: {
        publicUrl: webhookUrl,
        platformWebhookId: platformId,
        platformWebhookSecret: platformSecret ?? row.platformWebhookSecret,
        connectWebhookId: connectId,
        connectWebhookSecret: connectSecret ?? row.connectWebhookSecret,
        lastSyncedAt: new Date(),
        lastError: null,
      },
    })
  } catch (e) {
    await markError((e as Error).message || 'Error desconocido al sincronizar webhooks')
  }

  return getStripeBootstrapStatus()
}

async function markError(msg: string) {
  try {
    const r = await prisma.stripeBootstrap.findUnique({ where: { isDefault: true } })
    if (r) {
      await prisma.stripeBootstrap.update({ where: { isDefault: true }, data: { lastError: msg } })
    } else {
      await prisma.stripeBootstrap.create({ data: { isDefault: true, lastError: msg } })
    }
  } catch {
    // BD no disponible — ignoramos para no bloquear el flujo.
  }
}

function isMissingResource(err: unknown): boolean {
  const e = err as { code?: string; statusCode?: number; raw?: { code?: string } } | null
  if (!e) return false
  if (e.statusCode === 404) return true
  if (e.code === 'resource_missing') return true
  if (e.raw?.code === 'resource_missing') return true
  return false
}

// ──────────────────────────────────────────────────────────────────────────
// Disparador lazy (background) — se invoca desde rutas frecuentes (p.ej. el
// bundle del CRM) para garantizar que en cuanto el admin abra la app, los
// webhooks estén sincronizados, sin bloquear su request.
// ──────────────────────────────────────────────────────────────────────────

let inFlight: Promise<void> | null = null
let lastCheckedAt = 0
const CHECK_TTL_MS = 5 * 60 * 1000 // 5 minutos entre intentos

export function scheduleEnsureStripeWebhooks() {
  if (!process.env.STRIPE_SECRET_KEY) return
  const now = Date.now()
  if (inFlight) return
  if (now - lastCheckedAt < CHECK_TTL_MS) return
  lastCheckedAt = now
  inFlight = (async () => {
    try {
      await ensureStripeWebhooks()
    } catch {
      // Errores se persisten en `lastError` desde dentro de ensureStripeWebhooks.
    } finally {
      inFlight = null
    }
  })()
}

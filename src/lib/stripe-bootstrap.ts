/**
 * Bootstrap automático de los WebhookEndpoints de Stripe (URL + IDs en BD).
 *
 * `ensureStripeWebhooks` detecta la URL pública (`NEXT_PUBLIC_APP_URL` o
 * `RAILWAY_PUBLIC_DOMAIN`), crea o actualiza en Stripe dos endpoints (plataforma
 * + Connect) y guarda solo sus IDs. Los **`whsec_…` no se guardan en BD**:
 * configúralos a mano en `STRIPE_WEBHOOK_SECRET` y `STRIPE_CONNECT_WEBHOOK_SECRET`.
 * `/api/stripe/webhook` verifica las firmas **solo con esas variables de entorno**.
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
  const platformSecret = !!(process.env.STRIPE_WEBHOOK_SECRET || '').trim()
  const connectSecret = !!(process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '').trim()
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
      hasPlatformSecret: platformSecret,
      hasConnectSecret: connectSecret,
      envOverridesPlatform: platformSecret,
      envOverridesConnect: connectSecret,
      lastSyncedAt: null,
      error: (e as Error).message,
    }
  }
  const secretsReady = platformSecret && connectSecret
  const idsReady = !!(row.platformWebhookId && row.connectWebhookId)
  return {
    ok: secretsReady && idsReady && !row.lastError,
    configured: secretsReady && idsReady,
    publicUrl: detectPublicBaseUrl(),
    webhookUrl: detectWebhookUrl(),
    platformWebhookId: row.platformWebhookId,
    connectWebhookId: row.connectWebhookId,
    hasPlatformSecret: platformSecret,
    hasConnectSecret: connectSecret,
    envOverridesPlatform: platformSecret,
    envOverridesConnect: connectSecret,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    error: row.lastError ?? null,
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

  // Si los endpoints ya apuntan a esta URL pública (secrets solo en env), no hagas nada.
  if (
    row.publicUrl === webhookUrl &&
    row.platformWebhookId &&
    row.connectWebhookId &&
    !row.lastError
  ) {
    return getStripeBootstrapStatus()
  }

  try {
    // PLATFORM endpoint
    let platformId = row.platformWebhookId
    /** Solo al crear endpoint nuevo Stripe devuelve `secret` (una vez). */
    let createdPlatformSigningSecret: string | null = null
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
      createdPlatformSigningSecret = created.secret ?? null
    }

    // CONNECT endpoint
    let connectId = row.connectWebhookId
    let createdConnectSigningSecret: string | null = null
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
      createdConnectSigningSecret = created.secret ?? null
    }

    const envHasPlatformSecret = !!(process.env.STRIPE_WEBHOOK_SECRET || '').trim()
    const envHasConnectSecret = !!(process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '').trim()

    const lastErrorHints: string[] = []
    if (createdPlatformSigningSecret && !envHasPlatformSecret) {
      lastErrorHints.push(
        'Se creó el webhook de la plataforma: copia el signing secret desde el Dashboard de Stripe a STRIPE_WEBHOOK_SECRET.',
      )
    }
    if (createdConnectSigningSecret && !envHasConnectSecret) {
      lastErrorHints.push(
        'Se creó el webhook Connect: copia el signing secret desde el Dashboard de Stripe a STRIPE_CONNECT_WEBHOOK_SECRET.',
      )
    }

    row = await prisma.stripeBootstrap.update({
      where: { isDefault: true },
      data: {
        publicUrl: webhookUrl,
        platformWebhookId: platformId,
        platformWebhookSecret: null,
        connectWebhookId: connectId,
        connectWebhookSecret: null,
        lastSyncedAt: new Date(),
        lastError: lastErrorHints.length > 0 ? lastErrorHints.join(' ') : null,
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

/**
 * Bootstrap automático de WebhookEndpoints de Stripe (URL, IDs y signing secrets en BD).
 *
 * Al crear un endpoint, Stripe devuelve `whsec_…` una sola vez; se guarda en
 * `StripeBootstrap`. El admin no necesita Railway: basta abrir el CRM o pulsar
 * «Actualizar enlaces» en Configuración del club.
 *
 * Variables de entorno opcionales (override del programador):
 * `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`.
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

type BootstrapRow = {
  platformWebhookId: string | null
  platformWebhookSecret: string | null
  connectWebhookId: string | null
  connectWebhookSecret: string | null
  publicUrl: string | null
  lastError: string | null
  lastSyncedAt: Date | null
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
  /** true si el secret activo viene de variable de entorno (override) */
  envOverridesPlatform: boolean
  envOverridesConnect: boolean
  /** true si el secret activo está guardado en BD */
  storedInDbPlatform: boolean
  storedInDbConnect: boolean
  lastSyncedAt: string | null
  error: string | null
}

function trimSecret(value: string | null | undefined): string | null {
  const v = (value || '').trim()
  return v.startsWith('whsec_') ? v : null
}

function envPlatformSecret(): string | null {
  return trimSecret(process.env.STRIPE_WEBHOOK_SECRET)
}

function envConnectSecret(): string | null {
  return trimSecret(process.env.STRIPE_CONNECT_WEBHOOK_SECRET)
}

/** Secretos efectivos: env (si existe) > BD. */
export async function getWebhookSigningSecrets(): Promise<{
  platform: string | null
  connect: string | null
}> {
  const envPlatform = envPlatformSecret()
  const envConnect = envConnectSecret()
  if (envPlatform && envConnect) {
    return { platform: envPlatform, connect: envConnect }
  }

  let row: BootstrapRow | null = null
  try {
    row = await prisma.stripeBootstrap.findUnique({ where: { isDefault: true } })
  } catch {
    row = null
  }

  return {
    platform: envPlatform ?? trimSecret(row?.platformWebhookSecret),
    connect: envConnect ?? trimSecret(row?.connectWebhookSecret),
  }
}

async function getRow() {
  const existing = await prisma.stripeBootstrap.findUnique({ where: { isDefault: true } })
  if (existing) return existing
  return prisma.stripeBootstrap.create({ data: { isDefault: true } })
}

export async function getStripeBootstrapStatus(): Promise<StripeBootstrapStatus> {
  const envPlatform = envPlatformSecret()
  const envConnect = envConnectSecret()
  let row: BootstrapRow | null = null
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
      hasPlatformSecret: !!envPlatform,
      hasConnectSecret: !!envConnect,
      envOverridesPlatform: !!envPlatform,
      envOverridesConnect: !!envConnect,
      storedInDbPlatform: false,
      storedInDbConnect: false,
      lastSyncedAt: null,
      error: (e as Error).message,
    }
  }

  const dbPlatform = trimSecret(row.platformWebhookSecret)
  const dbConnect = trimSecret(row.connectWebhookSecret)
  const platformActive = envPlatform ?? dbPlatform
  const connectActive = envConnect ?? dbConnect
  const secretsReady = !!platformActive && !!connectActive
  const idsReady = !!(row.platformWebhookId && row.connectWebhookId)

  return {
    ok: secretsReady && idsReady && !row.lastError,
    configured: secretsReady && idsReady,
    publicUrl: detectPublicBaseUrl(),
    webhookUrl: detectWebhookUrl(),
    platformWebhookId: row.platformWebhookId,
    connectWebhookId: row.connectWebhookId,
    hasPlatformSecret: !!platformActive,
    hasConnectSecret: !!connectActive,
    envOverridesPlatform: !!envPlatform,
    envOverridesConnect: !!envConnect,
    storedInDbPlatform: !!dbPlatform,
    storedInDbConnect: !!dbConnect,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    error: row.lastError ?? null,
  }
}

async function deleteWebhookEndpoint(stripe: Stripe, endpointId: string | null) {
  if (!endpointId) return
  try {
    await stripe.webhookEndpoints.del(endpointId)
  } catch (err) {
    if (!isMissingResource(err)) throw err
  }
}

/**
 * Si hay endpoint en Stripe pero no tenemos signing secret (no se puede re-leer),
 * borramos y recreamos para obtener uno nuevo.
 */
async function syncWebhookEndpoint(
  stripe: Stripe,
  opts: {
    webhookUrl: string
    connect: boolean
    existingId: string | null
    existingSecret: string | null
    envSecret: string | null
    description: string
  },
): Promise<{ id: string; secret: string | null }> {
  let endpointId = opts.existingId
  const hasUsableSecret = !!(opts.envSecret || trimSecret(opts.existingSecret))

  if (endpointId && !hasUsableSecret) {
    await deleteWebhookEndpoint(stripe, endpointId)
    endpointId = null
  }

  if (endpointId) {
    try {
      await stripe.webhookEndpoints.update(endpointId, {
        url: opts.webhookUrl,
        enabled_events: REQUIRED_WEBHOOK_EVENTS,
        description: opts.description,
      })
      return {
        id: endpointId,
        secret: opts.envSecret ?? trimSecret(opts.existingSecret),
      }
    } catch (err) {
      if (!isMissingResource(err)) throw err
      endpointId = null
    }
  }

  const created = await stripe.webhookEndpoints.create({
    url: opts.webhookUrl,
    enabled_events: REQUIRED_WEBHOOK_EVENTS,
    connect: opts.connect,
    description: opts.description,
  })

  return {
    id: created.id,
    secret: trimSecret(created.secret) ?? opts.envSecret ?? null,
  }
}

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
  const row = await getRow()
  const envPlatform = envPlatformSecret()
  const envConnect = envConnectSecret()

  const alreadySynced =
    row.publicUrl === webhookUrl &&
    row.platformWebhookId &&
    row.connectWebhookId &&
    (envPlatform || trimSecret(row.platformWebhookSecret)) &&
    (envConnect || trimSecret(row.connectWebhookSecret)) &&
    !row.lastError

  if (alreadySynced) {
    return getStripeBootstrapStatus()
  }

  try {
    const platform = await syncWebhookEndpoint(stripe, {
      webhookUrl,
      connect: false,
      existingId: row.platformWebhookId,
      existingSecret: row.platformWebhookSecret,
      envSecret: envPlatform,
      description: 'ProClubCRM —platform events (auto)',
    })

    const connect = await syncWebhookEndpoint(stripe, {
      webhookUrl,
      connect: true,
      existingId: row.connectWebhookId,
      existingSecret: row.connectWebhookSecret,
      envSecret: envConnect,
      description: 'ProClubCRM —Connect events (auto)',
    })

    const hints: string[] = []
    if (!envPlatform && !platform.secret) {
      hints.push('No se pudo obtener el signing secret del webhook de plataforma.')
    }
    if (!envConnect && !connect.secret) {
      hints.push('No se pudo obtener el signing secret del webhook Connect.')
    }

    await prisma.stripeBootstrap.update({
      where: { isDefault: true },
      data: {
        publicUrl: webhookUrl,
        platformWebhookId: platform.id,
        platformWebhookSecret: envPlatform ? null : platform.secret,
        connectWebhookId: connect.id,
        connectWebhookSecret: envConnect ? null : connect.secret,
        lastSyncedAt: new Date(),
        lastError: hints.length > 0 ? hints.join(' ') : null,
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
    // BD no disponible
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

let inFlight: Promise<void> | null = null
let lastCheckedAt = 0
const CHECK_TTL_MS = 5 * 60 * 1000

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
      // lastError en BD
    } finally {
      inFlight = null
    }
  })()
}

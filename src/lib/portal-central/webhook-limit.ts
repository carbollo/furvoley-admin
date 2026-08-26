/**
 * Límites del webhook de alta automática, para evitar que un token filtrado (o una
 * tienda comprometida) tumbe el portal: cada POST válido lanza aprovisionamiento
 * PESADO (CREATE DATABASE + `prisma db push` + `tsx bootstrap-admin`, procesos y
 * cientos de MB por alta). Dos controles en memoria (proceso persistente Railway):
 *   1. Rate-limit por TOKEN: máx N altas por ventana.
 *   2. Semáforo de concurrencia GLOBAL: máx K aprovisionamientos a la vez.
 * En ráfaga legítima que supere los topes, se responde 429/503 con Retry-After y la
 * tienda reintenta (los webhooks reintentan). Configurable por env.
 */
type Bucket = { count: number; resetAt: number }

declare global {
  // eslint-disable-next-line no-var
  var __webhookRateBuckets: Map<string, Bucket> | undefined
  // eslint-disable-next-line no-var
  var __webhookInflight: { n: number } | undefined
}

const buckets = globalThis.__webhookRateBuckets ?? new Map<string, Bucket>()
globalThis.__webhookRateBuckets = buckets
const inflight = globalThis.__webhookInflight ?? { n: 0 }
globalThis.__webhookInflight = inflight

const RATE_MAX = Number(process.env.WEBHOOK_RATE_MAX || 30)
const RATE_WINDOW_MS = Number(process.env.WEBHOOK_RATE_WINDOW_MS || 60_000)
const MAX_CONCURRENT = Number(process.env.WEBHOOK_MAX_CONCURRENT || 3)

/** Rate-limit por clave (token). Cuenta cada intento aceptado. */
export function checkWebhookRate(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return { ok: true }
  }
  if (b.count >= RATE_MAX) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
  }
  b.count += 1
  return { ok: true }
}

/** Intenta reservar un hueco de aprovisionamiento (concurrencia global acotada). */
export function tryAcquireProvisionSlot(): boolean {
  if (inflight.n >= MAX_CONCURRENT) return false
  inflight.n += 1
  return true
}

export function releaseProvisionSlot(): void {
  inflight.n = Math.max(0, inflight.n - 1)
}

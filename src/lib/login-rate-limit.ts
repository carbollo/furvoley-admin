/**
 * Rate limiting para endpoints de login (anti fuerza bruta / credential stuffing).
 *
 * Cuenta INTENTOS FALLIDOS por clave (IP + identificador) dentro de una ventana.
 * Tras `LOGIN_RATE_MAX` fallos se bloquea hasta que expira la ventana. Un login
 * correcto resetea el contador, de modo que los usuarios legítimos no se ven
 * penalizados.
 *
 * Almacenamiento en memoria (vía globalThis), suficiente en un proceso persistente
 * (Railway). En despliegues multi-instancia conviene respaldarlo con un store
 * compartido (Redis/DB); aun así, esta capa frena los ataques básicos por IP.
 */
type Bucket = { count: number; resetAt: number }

const WINDOW_MS = Number(process.env.LOGIN_RATE_WINDOW_MS || 15 * 60_000)
const MAX_FAILURES = Number(process.env.LOGIN_RATE_MAX || 10)

declare global {
  // eslint-disable-next-line no-var
  var __loginRateBuckets: Map<string, Bucket> | undefined
}

const buckets = globalThis.__loginRateBuckets ?? new Map<string, Bucket>()
globalThis.__loginRateBuckets = buckets

/** Extrae la IP del cliente de unos headers (proxy Railway/Cloudflare). */
export function clientIpFromHeaders(headers: {
  get(name: string): string | null | undefined
}): string {
  const forwarded = headers.get('x-forwarded-for')
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : ''
  return first || headers.get('x-real-ip') || headers.get('cf-connecting-ip') || 'unknown'
}

export function loginRateKey(ip: string, identifier?: string): string {
  return `${ip}::${(identifier || '').toLowerCase().slice(0, 120)}`
}

/** ¿Está la clave bloqueada por exceso de fallos? Llamar ANTES de verificar. */
export function checkLoginRateLimit(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || now >= existing.resetAt) return { ok: true }
  if (existing.count >= MAX_FAILURES) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) }
  }
  return { ok: true }
}

/** Registra un intento fallido. Llamar cuando las credenciales NO son válidas. */
export function registerLoginFailure(key: string): void {
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  existing.count += 1
}

/** Limpia el contador tras un login correcto. */
export function resetLoginAttempts(key: string): void {
  buckets.delete(key)
}

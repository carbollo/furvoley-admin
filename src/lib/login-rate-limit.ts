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
// Límite POR CUENTA (email), independiente de la IP: aunque un atacante rote el
// X-Forwarded-For para obtener una IP nueva por petición, el credential-stuffing
// sobre un email conocido queda acotado. Más alto que el por-IP para no facilitar
// un lockout malicioso de la víctima.
const MAX_FAILURES_EMAIL = Number(process.env.LOGIN_RATE_MAX_EMAIL || MAX_FAILURES * 3)

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
  // Preferimos cabeceras que FIJA la plataforma/edge (no las puede falsear el
  // cliente) antes que el primer valor de x-forwarded-for (izquierda), que sí es
  // manipulable. El límite por-cuenta (abajo) cubre el caso de que el proxy no las
  // provea y solo quede el x-forwarded-for spoofable.
  const cf = headers.get('cf-connecting-ip')
  if (typeof cf === 'string' && cf.trim()) return cf.trim()
  const real = headers.get('x-real-ip')
  if (typeof real === 'string' && real.trim()) return real.trim()
  const forwarded = headers.get('x-forwarded-for')
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : ''
  return first || 'unknown'
}

export function loginRateKey(ip: string, identifier?: string): string {
  return `${ip}::${(identifier || '').toLowerCase().slice(0, 120)}`
}

/** Clave POR CUENTA (email), derivada de la parte de identificador de la clave. */
function accountKey(key: string): string | null {
  const email = key.split('::').slice(1).join('::').trim()
  return email ? `acct::${email}` : null
}

/** ¿Está la clave bloqueada por exceso de fallos? Llamar ANTES de verificar. */
export function checkLoginRateLimit(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  const check = (k: string, max: number): { ok: true } | { ok: false; retryAfterSec: number } => {
    const b = buckets.get(k)
    if (!b || now >= b.resetAt) return { ok: true }
    if (b.count >= max) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
    return { ok: true }
  }
  const ipCheck = check(key, MAX_FAILURES)
  if (!ipCheck.ok) return ipCheck
  const acct = accountKey(key)
  return acct ? check(acct, MAX_FAILURES_EMAIL) : { ok: true }
}

/** Registra un intento fallido. Llamar cuando las credenciales NO son válidas. */
export function registerLoginFailure(key: string): void {
  const now = Date.now()
  const bump = (k: string) => {
    const b = buckets.get(k)
    if (!b || now >= b.resetAt) buckets.set(k, { count: 1, resetAt: now + WINDOW_MS })
    else b.count += 1
  }
  bump(key)
  const acct = accountKey(key)
  if (acct) bump(acct)
}

/** Limpia el contador tras un login correcto. */
export function resetLoginAttempts(key: string): void {
  buckets.delete(key)
  const acct = accountKey(key)
  if (acct) buckets.delete(acct)
}

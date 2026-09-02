/**
 * Cliente REST de la API de Whop (pasarela de cobro del CRM).
 *
 * NO lleva 'use server': es un módulo de servidor puro. Con 'use server' cada
 * export sería un endpoint RPC invocable por cualquier cliente (crear cuentas,
 * mover dinero). Se usa solo desde rutas API con requireRoles, el webhook
 * (firmado) o crons (Bearer CRON_SECRET).
 *
 * Dos niveles de credencial:
 *  - PLATAFORMA (env WHOP_API_KEY): crea las companies de los clubes y registra
 *    el webhook único.
 *  - CLUB (ClubSettings.whopApiKey): opera dentro de la cuenta de un club
 *    (planes, checkouts, saldo, transferencias).
 */

const DEFAULT_BASE = 'https://api.whop.com/api/v1'

/**
 * Versión de la API fijada por defecto. Sin cabecera `Api-Version-Date` Whop
 * asume la semántica de 2025-01-01, así que se pinea siempre para que un cambio
 * de default en su lado no altere el comportamiento en silencio.
 */
const DEFAULT_VERSION_DATE = '2026-08-25-2'

/** La versión con la que se habla con la pasarela, ya resuelta. */
export function whopVersionDate(): string {
  return (process.env.WHOP_API_VERSION_DATE || '').trim() || DEFAULT_VERSION_DATE
}

export type WhopCredential = { apiKey: string }

export class WhopError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'WhopError'
    this.status = status
    this.body = body
  }
}

/** Base de la API (producción o sandbox, según env). */
export function whopApiBase(): string {
  return (process.env.WHOP_API_BASE || '').trim().replace(/\/+$/, '') || DEFAULT_BASE
}

/** Credencial de la cuenta PLATAFORMA (la del dueño del SaaS). */
export function platformCredential(): WhopCredential | null {
  const apiKey = (process.env.WHOP_API_KEY || '').trim()
  return apiKey ? { apiKey } : null
}

/** ID de la company plataforma (biz_…), padre de las cuentas de los clubes. */
export function platformCompanyId(): string {
  return (process.env.WHOP_PARENT_COMPANY_ID || '').trim()
}

/** ¿Está configurada la pasarela a nivel de plataforma? */
export function isWhopConfigured(): boolean {
  return Boolean(platformCredential() && platformCompanyId())
}

/** Enlace de partner: los negocios que se registran por él se atribuyen al dueño. */
export function referralUrl(): string {
  return (process.env.WHOP_REFERRAL_URL || '').trim()
}

type RequestOpts = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  credential: WhopCredential
  /** Clave de idempotencia (obligatoria de facto en operaciones de dinero). */
  idempotencyKey?: string
  timeoutMs?: number
}

/**
 * Llamada cruda a la API de Whop. Lanza `WhopError` con el status y el cuerpo
 * de error para que quien llama decida (nunca se devuelve al cliente crudo: los
 * mensajes de la pasarela pueden filtrar detalles internos).
 */
export async function whopRequest<T = unknown>(opts: RequestOpts): Promise<T> {
  const { method = 'GET', path, query, body, credential, idempotencyKey, timeoutMs = 20000 } = opts

  const url = new URL(whopApiBase() + (path.startsWith('/') ? path : `/${path}`))
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${credential.apiKey}`,
    Accept: 'application/json',
  }
  headers['Api-Version-Date'] =
    (process.env.WHOP_API_VERSION_DATE || '').trim() || DEFAULT_VERSION_DATE
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let text: string
  let res: Response
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    })
    // La lectura del cuerpo va DENTRO del mismo timeout: `fetch` resuelve al
    // recibir las cabeceras, así que un servidor que gotee el cuerpo dejaría el
    // handler colgado indefinidamente si se desarmara el temporizador aquí.
    text = await res.text()
  } catch (e) {
    throw new WhopError(
      e instanceof Error && e.name === 'AbortError'
        ? 'La pasarela no respondió a tiempo.'
        : 'No se pudo contactar con la pasarela.',
      0,
      null,
    )
  } finally {
    clearTimeout(timer)
  }

  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error?: unknown }).error)
        : '') || `Error ${res.status} de la pasarela`
    throw new WhopError(msg, res.status, parsed)
  }
  return parsed as T
}

import type { NextResponse } from 'next/server'
import { validationError } from '@/lib/db-input-validation'

type ApiWassMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type ApiWassRequestOptions = {
  method?: ApiWassMethod
  body?: unknown
}

/** ApiWass session ids are user-defined (e.g. 93_pruebas), not Prisma CUIDs. */
const APIWASS_SESSION_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/

export function isApiWassSessionId(value: string | null | undefined): boolean {
  return APIWASS_SESSION_ID_RE.test(String(value ?? '').trim())
}

export function parseApiWassSessionId(
  value: string | null | undefined,
  field = 'id',
): string | NextResponse {
  const v = String(value ?? '').trim()
  if (!v) return validationError(`Falta "${field}".`)
  if (!APIWASS_SESSION_ID_RE.test(v)) {
    return validationError(`"${field}" no tiene un formato válido.`)
  }
  return v
}

function baseUrl() {
  return (process.env.APIWASS_BASE_URL || 'https://apiwass.com/api').replace(/\/+$/, '')
}

function apiKey() {
  return String(process.env.APIWASS_API_KEY || '').trim()
}

export function getDefaultApiWassSessionId() {
  return String(process.env.APIWASS_DEFAULT_SESSION_ID || '').trim()
}

function normalizePhone(raw: string) {
  const compact = String(raw || '').replace(/[^\d+]/g, '').trim()
  if (!compact) return ''
  return compact.startsWith('+') ? compact.slice(1) : compact
}

export async function apiWassRequest(path: string, options: ApiWassRequestOptions = {}) {
  const key = apiKey()
  if (!key) {
    throw new Error('Falta APIWASS_API_KEY en variables de entorno.')
  }

  const method = options.method ?? 'GET'
  const url = `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`
  const headers: Record<string, string> = {
    'x-api-key': key,
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const r = await fetch(url, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  })

  const text = await r.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!r.ok) {
    const msg =
      (json && (json.error || json.message)) ||
      text ||
      `Error ApiWass (${r.status})`
    throw new Error(msg)
  }

  return json ?? { ok: true }
}

export async function sendApiWassText(input: {
  sessionId?: string
  phone: string
  message: string
}) {
  const sessionId = (input.sessionId || getDefaultApiWassSessionId()).trim()
  if (!sessionId) {
    throw new Error('Falta sessionId y no hay APIWASS_DEFAULT_SESSION_ID configurado.')
  }
  const phone = normalizePhone(input.phone)
  if (!phone) throw new Error('Número de teléfono inválido para WhatsApp.')
  const message = String(input.message || '').trim()
  if (!message) throw new Error('El mensaje no puede estar vacío.')

  return apiWassRequest(`/sessions/${encodeURIComponent(sessionId)}/messages/text`, {
    method: 'POST',
    body: { phone, message },
  })
}

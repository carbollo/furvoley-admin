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

/** Estado de la sesión (READY, DISCONNECTED…). Respuesta: { success, status, id }. */
export async function getApiWassSessionStatus(sessionId: string): Promise<string> {
  const data = await apiWassRequest(`/sessions/${encodeURIComponent(sessionId)}/status`)
  return String((data && (data as any).status) || '').trim()
}

/**
 * ¿Ese teléfono existe en WhatsApp? (Baileys `onWhatsApp`). Devuelve el JID
 * canónico, que es lo que conviene pasar luego como participante.
 * Un número sin prefijo internacional (p. ej. "600123456" en vez de
 * "34600123456") NO existe en WhatsApp y devolverá exists=false.
 */
export async function checkApiWassNumber(
  sessionId: string,
  phone: string,
): Promise<{ exists: boolean; jid: string | null }> {
  const data = await apiWassRequest(`/sessions/${encodeURIComponent(sessionId)}/check-number`, {
    method: 'POST',
    body: { phone: normalizePhone(phone) },
  })
  return {
    exists: Boolean((data as any)?.exists),
    jid: ((data as any)?.jid as string | undefined) || null,
  }
}

/**
 * Crea un grupo de WhatsApp en la sesión indicada. `participants` acepta
 * teléfonos o JIDs (el servidor normaliza los que no llevan '@').
 * Respuesta ApiWass: { success, group: { id: '…@g.us', … } }.
 */
export async function createApiWassGroup(input: {
  sessionId?: string
  name: string
  participants: string[]
}) {
  const sessionId = (input.sessionId || getDefaultApiWassSessionId()).trim()
  if (!sessionId) {
    throw new Error('Falta sessionId y no hay APIWASS_DEFAULT_SESSION_ID configurado.')
  }
  const name = String(input.name || '').trim()
  if (!name) throw new Error('El nombre del grupo no puede estar vacío.')
  // Los JIDs (…@s.whatsapp.net) se pasan tal cual; el resto se normaliza.
  const participants = [
    ...new Set(
      input.participants
        .map((p) => (String(p).includes('@') ? String(p).trim() : normalizePhone(p)))
        .filter(Boolean),
    ),
  ]
  if (participants.length === 0) {
    throw new Error('Ningún participante tiene teléfono válido para WhatsApp.')
  }

  return apiWassRequest(`/sessions/${encodeURIComponent(sessionId)}/groups`, {
    method: 'POST',
    body: { name, participants },
  })
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

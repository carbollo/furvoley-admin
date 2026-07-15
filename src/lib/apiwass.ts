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
 *
 * `image` es la foto del grupo y DEBE ser una URL http(s) descargable por
 * ApiWass — no admite Base64 (ver https://apiwass.com/api-reference · Grupos).
 * La foto se aplica tras crear el grupo: si falla, el grupo se crea igual y el
 * motivo vuelve en `pictureError`.
 *
 * Respuesta ApiWass: { success, group: { id: '…@g.us', … }, pictureError? }.
 */
export async function createApiWassGroup(input: {
  sessionId?: string
  name: string
  participants: string[]
  image?: string
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

  const image = String(input.image || '').trim()
  return apiWassRequest(`/sessions/${encodeURIComponent(sessionId)}/groups`, {
    method: 'POST',
    body: image ? { name, participants, image } : { name, participants },
  })
}

/**
 * Cambia la foto de un grupo ya creado. `image` debe ser URL http(s).
 * PUT /sessions/:id/groups/:groupId/picture (ver api-reference · Grupos avanzado).
 */
export async function setApiWassGroupPicture(input: {
  sessionId?: string
  groupJid: string
  image: string
}) {
  const sessionId = (input.sessionId || getDefaultApiWassSessionId()).trim()
  if (!sessionId) {
    throw new Error('Falta sessionId y no hay APIWASS_DEFAULT_SESSION_ID configurado.')
  }
  const groupJid = String(input.groupJid || '').trim()
  if (!isWhatsAppGroupJid(groupJid)) {
    throw new Error('El identificador del grupo de WhatsApp no es válido.')
  }
  const image = String(input.image || '').trim()
  if (!/^https?:\/\//i.test(image)) {
    throw new Error('La foto del grupo debe ser una URL http(s).')
  }

  return apiWassRequest(
    `/sessions/${encodeURIComponent(sessionId)}/groups/${encodeURIComponent(groupJid)}/picture`,
    { method: 'PUT', body: { image } },
  )
}

/** ¿Es el JID de un chat de grupo de WhatsApp? (…@g.us) */
export function isWhatsAppGroupJid(value: string | null | undefined): boolean {
  return String(value ?? '').trim().endsWith('@g.us')
}

/**
 * Envía un texto AL CHAT de un grupo de WhatsApp (un solo mensaje, no difusión).
 * Usa el mismo endpoint que los envíos 1 a 1: ApiWass pasa el JID tal cual
 * cuando lleva '@' (server/phone-utils.js → toWhatsAppJid). Por eso NO se puede
 * usar `sendApiWassText`, que normaliza el número y destruiría el "@g.us".
 */
export async function sendApiWassGroupText(input: {
  sessionId?: string
  groupJid: string
  message: string
}) {
  const sessionId = (input.sessionId || getDefaultApiWassSessionId()).trim()
  if (!sessionId) {
    throw new Error('Falta sessionId y no hay APIWASS_DEFAULT_SESSION_ID configurado.')
  }
  const groupJid = String(input.groupJid || '').trim()
  if (!isWhatsAppGroupJid(groupJid)) {
    throw new Error('El identificador del grupo de WhatsApp no es válido.')
  }
  const message = String(input.message || '').trim()
  if (!message) throw new Error('El mensaje no puede estar vacío.')

  return apiWassRequest(`/sessions/${encodeURIComponent(sessionId)}/messages/text`, {
    method: 'POST',
    body: { phone: groupJid, message },
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

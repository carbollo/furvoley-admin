import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { getPortalSsoSecret } from '@/lib/portal-sso'
import { prisma } from '@/lib/prisma'

const SESSION_COOKIE = 'portal-admin-session'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

function adminPassword() {
  return String(process.env.PORTAL_ADMIN_PASSWORD || '').trim()
}

function signingSecret() {
  return getPortalSsoSecret() || adminPassword()
}

export function isPortalAdminConfigured() {
  return Boolean(adminPassword() && signingSecret())
}

function signBody(body: string, secret: string) {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

type AdminPayload = { iss: string; sub?: string; exp: number; iat?: number }

function createSessionToken(sub: string) {
  const secret = signingSecret()
  if (!secret) throw new Error('Falta PORTAL_ADMIN_PASSWORD o PORTAL_SSO_SECRET.')
  const payload: AdminPayload = {
    iss: 'portal-admin',
    sub: sub || 'master',
    exp: Date.now() + SESSION_TTL_MS,
    iat: Date.now(), // para revocar sesiones al resetear la contraseña (sessionsInvalidBefore)
  }
  const body = Buffer.from(JSON.stringify({ ...payload, nonce: randomBytes(8).toString('hex') })).toString('base64url')
  return `${body}.${signBody(body, secret)}`
}

function parseSessionToken(token: string): AdminPayload | null {
  const secret = signingSecret()
  if (!secret || !token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = signBody(body, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AdminPayload
    if (payload.iss === 'portal-admin' && typeof payload.exp === 'number' && payload.exp > Date.now()) return payload
    return null
  } catch {
    return null
  }
}

export function verifyPortalAdminPassword(password: string) {
  const expected = adminPassword()
  const got = String(password || '')
  if (!expected || !got) return false
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function sessionPayloadFromCookies(): Promise<AdminPayload | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value || ''
  return parseSessionToken(decodeURIComponent(token))
}

/**
 * Para super-admins nombrados (sub != 'master') la sesión sigue siendo válida solo
 * si su PortalAdmin existe y está ACTIVE. Así, deshabilitarlo revoca de inmediato
 * su cookie ya emitida (el token HMAC es autocontenido y no se puede invalidar por
 * sí solo). La contraseña maestra (sub='master') no depende de BD.
 * Fail-closed: si la consulta a BD falla, se deniega para no dejar viva una sesión
 * que debería poder revocarse.
 */
async function isSessionSubjectActive(payload: AdminPayload): Promise<boolean> {
  const sub = payload.sub || 'master'
  if (sub === 'master') return true
  try {
    const admin = await prisma.portalAdmin.findUnique({
      where: { email: sub },
      select: { status: true, sessionsInvalidBefore: true },
    })
    if (admin?.status !== 'ACTIVE') return false
    // Revocación por reset de contraseña: si la sesión se emitió ANTES del corte, no vale.
    if (admin.sessionsInvalidBefore) {
      if (!payload.iat || payload.iat < admin.sessionsInvalidBefore.getTime()) return false
    }
    return true
  } catch {
    return false
  }
}

export async function isPortalAdminRequest() {
  const payload = await sessionPayloadFromCookies()
  if (!payload) return false
  return isSessionSubjectActive(payload)
}

/** Identidad de la sesión de super-admin (email del PortalAdmin o 'master'). */
export async function getPortalAdminIdentity(): Promise<string | null> {
  const payload = await sessionPayloadFromCookies()
  if (!payload) return null
  if (!(await isSessionSubjectActive(payload))) return null
  return payload.sub || 'super-admin'
}

export async function setPortalAdminSession(sub: string = 'master') {
  const token = createSessionToken(sub)
  const secure = process.env.NODE_ENV === 'production'
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export async function clearPortalAdminSession() {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
}

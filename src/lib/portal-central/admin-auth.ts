import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { getPortalSsoSecret } from '@/lib/portal-sso'

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

function createSessionToken() {
  const secret = signingSecret()
  if (!secret) throw new Error('Falta PORTAL_ADMIN_PASSWORD o PORTAL_SSO_SECRET.')
  const payload = {
    iss: 'portal-admin',
    exp: Date.now() + SESSION_TTL_MS,
    nonce: randomBytes(8).toString('hex'),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${signBody(body, secret)}`
}

function parseSessionToken(token: string) {
  const secret = signingSecret()
  if (!secret || !token) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [body, sig] = parts
  const expected = signBody(body, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      iss?: string
      exp?: number
    }
    return payload.iss === 'portal-admin' && typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
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

export async function isPortalAdminRequest() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value || ''
  return parseSessionToken(decodeURIComponent(token))
}

export async function setPortalAdminSession() {
  const token = createSessionToken()
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

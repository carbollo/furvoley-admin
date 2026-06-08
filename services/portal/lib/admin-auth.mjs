import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const SESSION_COOKIE = 'portal-admin-session'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

function adminPassword() {
  return String(process.env.PORTAL_ADMIN_PASSWORD || '').trim()
}

function signingSecret() {
  return String(process.env.PORTAL_SSO_SECRET || process.env.PORTAL_ADMIN_PASSWORD || '').trim()
}

export function getAdminPath() {
  const raw = String(process.env.PORTAL_ADMIN_PATH || 'furvoley-config').trim()
  return raw.replace(/^\/+|\/+$/g, '') || 'furvoley-config'
}

export function isAdminConfigured() {
  return Boolean(adminPassword() && signingSecret())
}

function signBody(body, secret) {
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

function parseSessionToken(token) {
  const secret = signingSecret()
  if (!secret || !token) return false
  const parts = String(token).split('.')
  if (parts.length !== 2) return false
  const [body, sig] = parts
  const expected = signBody(body, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return payload.iss === 'portal-admin' && typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
  }
}

export function verifyAdminPassword(password) {
  const expected = adminPassword()
  const got = String(password || '')
  if (!expected || !got) return false
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function readAdminCookie(req) {
  const raw = String(req.headers.cookie || '')
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === SESSION_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return ''
}

export function isAdminRequest(req) {
  return parseSessionToken(readAdminCookie(req))
}

export function setAdminSessionCookie(res) {
  const token = createSessionToken()
  const secure = process.env.NODE_ENV === 'production'
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`,
  )
}

export function clearAdminSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`)
}

export { SESSION_COOKIE }

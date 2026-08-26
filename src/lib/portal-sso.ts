import { createHmac, timingSafeEqual } from 'node:crypto'
import { encode } from 'next-auth/jwt'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { normalizeRole } from '@/lib/rbac'
import {
  credentialsMatchEnvAdmin,
  getEnvAdminCredentials,
  syncEnvAdminUser,
} from '@/lib/env-admin'

import { resolveNextAuthSecret } from '@/lib/auth-secret'

export type PortalVerifiedUser = {
  userId: string
  email: string
  name: string | null
  role: string
  memberId: string | null
  mustChangePassword: boolean
}

export type PortalSsoPayload = {
  sub: string
  email: string
  name: string | null
  role: string
  memberId: string | null
  mustChangePassword: boolean
  /** Club (slug) al que está LIGADO el token: el consumidor (/api/portal/sso)
   *  rechaza el token si el subdominio resuelto no coincide. Evita que un token
   *  minteado para el club A sea canjeable en el subdominio del club B. */
  tenant: string | null
  exp: number
  iss: 'furvoley-portal'
}

const SSO_ISSUER = 'furvoley-portal' as const
const SSO_TTL_MS = 60_000

export function getPortalSsoSecret() {
  return String(process.env.PORTAL_SSO_SECRET || '').trim()
}

export function isPortalSsoEnabled() {
  return Boolean(getPortalSsoSecret())
}

/** Origen público del CRM (evita redirects a localhost:8080 detrás del proxy Railway). */
export function resolvePortalPublicOrigin(request: Request) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https'
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, '')
  }

  const railway = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim()
  if (railway) {
    const url = railway.startsWith('http') ? railway : `https://${railway}`
    return url.replace(/\/+$/, '')
  }

  for (const raw of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    const url = String(raw || '').trim().replace(/\/+$/, '')
    if (url && !/localhost|127\.0\.0\.1/i.test(url)) return url
  }

  try {
    const origin = new URL(request.url).origin
    if (!/localhost|127\.0\.0\.1/i.test(origin)) return origin
  } catch {
    //
  }

  const fallback = String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').trim()
  return fallback.replace(/\/+$/, '') || 'http://localhost:3000'
}

export function assertPortalServerAuth(authHeader: string | null) {
  const secret = getPortalSsoSecret()
  if (!secret) {
    return { ok: false as const, status: 503, error: 'Portal SSO no configurado en este servicio.' }
  }
  const expected = `Bearer ${secret}`
  const got = String(authHeader || '').trim()
  if (!got || got.length !== expected.length) {
    return { ok: false as const, status: 401, error: 'No autorizado.' }
  }
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (!timingSafeEqual(a, b)) {
    return { ok: false as const, status: 401, error: 'No autorizado.' }
  }
  return { ok: true as const }
}

export async function verifyPortalCredentials(
  rawEmail: string,
  password: string,
): Promise<PortalVerifiedUser | null> {
  const normalizedEmail = String(rawEmail || '').trim().toLowerCase()
  const pwd = String(password || '')
  if (!normalizedEmail || !pwd) return null

  if (credentialsMatchEnvAdmin(rawEmail, pwd)) {
    await syncEnvAdminUser(prisma)
    const env = getEnvAdminCredentials()!
    const fixed = await prisma.user.findUnique({ where: { email: env.email } })
    if (!fixed?.email) return null
    return {
      userId: fixed.id,
      email: fixed.email,
      name: fixed.name,
      role: normalizeRole(fixed.role),
      memberId: fixed.memberId,
      mustChangePassword: false,
    }
  }

  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (!user && rawEmail.trim() !== normalizedEmail) {
    user = await prisma.user.findUnique({ where: { email: rawEmail.trim() } })
  }
  if (!user) {
    const candidates = await prisma.user.findMany({
      where: { email: { equals: rawEmail.trim(), mode: 'insensitive' } },
      take: 2,
    })
    if (candidates.length === 1) user = candidates[0]
  }

  if (!user?.password || !user.email) return null
  const valid = await bcrypt.compare(pwd, user.password)
  if (!valid) return null

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: normalizeRole(user.role),
    memberId: user.memberId,
    mustChangePassword: user.mustChangePassword === true,
  }
}

function signBody(body: string, secret: string) {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function createPortalSsoToken(
  user: PortalVerifiedUser,
  secret = getPortalSsoSecret(),
  tenantSlug: string | null = null,
) {
  if (!secret) throw new Error('PORTAL_SSO_SECRET missing')
  const payload: PortalSsoPayload = {
    sub: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    memberId: user.memberId,
    mustChangePassword: user.mustChangePassword,
    tenant: tenantSlug,
    exp: Date.now() + SSO_TTL_MS,
    iss: SSO_ISSUER,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${signBody(body, secret)}`
}

export function parsePortalSsoToken(token: string, secret = getPortalSsoSecret()): PortalSsoPayload | null {
  if (!secret) return null
  const parts = String(token || '').split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = signBody(body, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PortalSsoPayload
    if (payload.iss !== SSO_ISSUER) return null
    if (!payload.sub || !payload.email || !payload.role) return null
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

/**
 * ¿El token está autorizado para este club? Si lleva claim `tenant`, debe
 * coincidir con el subdominio resuelto. Tokens sin claim (emitidos antes del
 * despliegue de esta protección) se aceptan por compatibilidad — como el TTL es
 * de 60 s, dejan de existir enseguida. No se puede falsificar el claim: el token
 * va firmado (HMAC), así que cualquier token real que alguien tenga va ligado.
 */
export function ssoTokenMatchesTenant(payload: PortalSsoPayload, slug: string | null | undefined): boolean {
  if (!payload.tenant) return true // token antiguo sin binding: compatibilidad breve
  return payload.tenant === String(slug || '')
}

export const MOBILE_ACCESS_TOKEN_MAX_AGE = 30 * 24 * 60 * 60

export async function issueMobileAccessToken(payload: PortalSsoPayload) {
  const secret = resolveNextAuthSecret()
  if (!secret) throw new Error('NEXTAUTH_SECRET missing')

  const accessToken = await encode({
    token: {
      sub: payload.sub,
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: normalizeRole(payload.role),
      memberId: payload.memberId,
      mustChangePassword: payload.mustChangePassword,
      // Liga el token al club (anti reuso cross-tenant en requireRoles).
      tenant: payload.tenant ?? null,
    },
    secret,
    maxAge: MOBILE_ACCESS_TOKEN_MAX_AGE,
  })

  return {
    accessToken,
    expiresIn: MOBILE_ACCESS_TOKEN_MAX_AGE,
    user: {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: normalizeRole(payload.role),
      memberId: payload.memberId,
      mustChangePassword: payload.mustChangePassword,
    },
  }
}

export async function buildPortalSessionCookie(payload: PortalSsoPayload) {
  const secret = resolveNextAuthSecret()
  if (!secret) throw new Error('NEXTAUTH_SECRET missing')

  const maxAge = MOBILE_ACCESS_TOKEN_MAX_AGE
  const token = await encode({
    token: {
      sub: payload.sub,
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: normalizeRole(payload.role),
      memberId: payload.memberId,
      mustChangePassword: payload.mustChangePassword,
      // Liga la cookie de sesión al club (anti reuso cross-tenant en requireRoles).
      tenant: payload.tenant ?? null,
    },
    secret,
    maxAge,
  })

  const secure = process.env.NODE_ENV === 'production'
  const cookieName = secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token'

  return {
    name: cookieName,
    value: token,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      secure,
      maxAge,
    },
  }
}

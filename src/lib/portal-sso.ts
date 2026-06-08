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
    if (!fixed) return null
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

  if (!user?.password) return null
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

export function createPortalSsoToken(user: PortalVerifiedUser, secret = getPortalSsoSecret()) {
  if (!secret) throw new Error('PORTAL_SSO_SECRET missing')
  const payload: PortalSsoPayload = {
    sub: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    memberId: user.memberId,
    mustChangePassword: user.mustChangePassword,
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

export async function buildPortalSessionCookie(payload: PortalSsoPayload) {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET missing')

  const maxAge = 30 * 24 * 60 * 60
  const token = await encode({
    token: {
      sub: payload.sub,
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      memberId: payload.memberId,
      mustChangePassword: payload.mustChangePassword,
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

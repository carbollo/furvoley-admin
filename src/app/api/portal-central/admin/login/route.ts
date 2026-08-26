import { NextResponse } from 'next/server'
import {
  isPortalAdminConfigured,
  isPortalAdminRequest,
  getPortalAdminIdentity,
  setPortalAdminSession,
  verifyPortalAdminPassword,
} from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { verifyPortalAdminUser } from '@/lib/portal-central/portal-store'
import {
  checkLoginRateLimit,
  clientIpFromHeaders,
  loginRateKey,
  registerLoginFailure,
  resetLoginAttempts,
} from '@/lib/login-rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isPortalCentralHost()) {
    return NextResponse.json({ error: 'Panel admin solo en servicio portal.' }, { status: 404 })
  }
  if (!isPortalAdminConfigured()) {
    return NextResponse.json({ error: 'Define PORTAL_ADMIN_PASSWORD en Railway.' }, { status: 503 })
  }

  const rlKey = loginRateKey(clientIpFromHeaders(request.headers), 'portal-admin')
  const rl = checkLoginRateLimit(rlKey)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Espera unos minutos.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  let body: { password?: string; email?: string }
  try {
    body = (await request.json()) as { password?: string; email?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')

  // Login por super-admin (email+contraseña) si se indica email; si no, la
  // contraseña maestra de entorno (fallback que nunca se elimina).
  if (email) {
    const admin = await verifyPortalAdminUser(email, password)
    if (!admin) {
      registerLoginFailure(rlKey)
      return NextResponse.json({ error: 'Email o contraseña incorrectos.' }, { status: 401 })
    }
    resetLoginAttempts(rlKey)
    await setPortalAdminSession(admin.email)
    return NextResponse.json({ ok: true })
  }

  if (!verifyPortalAdminPassword(password)) {
    registerLoginFailure(rlKey)
    return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401 })
  }

  resetLoginAttempts(rlKey)
  await setPortalAdminSession('master')
  return NextResponse.json({ ok: true })
}

export async function GET() {
  if (!isPortalCentralHost()) {
    return NextResponse.json({ ok: false, configured: false })
  }
  const authenticated = await isPortalAdminRequest()
  return NextResponse.json({
    ok: true,
    configured: isPortalAdminConfigured(),
    authenticated,
    identity: authenticated ? await getPortalAdminIdentity() : null,
  })
}

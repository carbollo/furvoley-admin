import { NextResponse } from 'next/server'
import { buildTenantSsoUrl, isPortalCentralHost, isPortalTenantMode } from '@/lib/portal-central/config'
import { buildSsoRedirectUrl, verifyOnTenant } from '@/lib/portal-central/login'
import { loadTenants } from '@/lib/portal-central/tenants-store'
import { verifyPortalUser } from '@/lib/portal-central/portal-store'
import { createPortalSsoToken, getPortalSsoSecret } from '@/lib/portal-sso'
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
    return NextResponse.json({ error: 'Portal central no activo en este servicio.' }, { status: 404 })
  }

  const secret = getPortalSsoSecret()
  if (!secret) {
    return NextResponse.json({ error: 'Falta PORTAL_SSO_SECRET.' }, { status: 503 })
  }

  let body: { email?: string; password?: string }
  try {
    body = (await request.json()) as { email?: string; password?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const email = String(body.email || '').trim()
  const password = String(body.password || '')
  if (!email || !password) {
    return NextResponse.json({ error: 'Email y contraseña requeridos.' }, { status: 400 })
  }

  const rlKey = loginRateKey(clientIpFromHeaders(request.headers), email)
  const rl = checkLoginRateLimit(rlKey)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Espera unos minutos.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  // Modelo C: autentica contra el directorio del portal y redirige al subdominio.
  if (isPortalTenantMode()) {
    const match = await verifyPortalUser(email, password)
    if (!match) {
      registerLoginFailure(rlKey)
      return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 })
    }
    resetLoginAttempts(rlKey)
    const token = createPortalSsoToken(
      {
        userId: match.user.id,
        email: match.user.email,
        name: match.user.name,
        role: match.user.role,
        memberId: null,
        mustChangePassword: false,
      },
      secret,
      match.tenant.slug, // liga el token a este club
    )
    try {
      return NextResponse.json({
        ok: true,
        tenant: { id: match.tenant.id, name: match.tenant.name, slug: match.tenant.slug },
        redirectUrl: buildTenantSsoUrl(match.tenant.slug, token),
      })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'No se pudo construir el redirect.' },
        { status: 503 },
      )
    }
  }

  // Modelo antiguo (CRMs por URL).
  const tenants = await loadTenants()
  if (tenants.length === 0) {
    return NextResponse.json(
      { error: 'No hay CRMs configurados. Entra a /furvoley-config' },
      { status: 503 },
    )
  }

  const matches = []
  for (const tenant of tenants) {
    const hit = await verifyOnTenant(tenant, email, password, secret)
    if (hit) matches.push(hit)
  }

  if (matches.length === 0) {
    registerLoginFailure(rlKey)
    return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 })
  }

  resetLoginAttempts(rlKey)

  if (matches.length > 1) {
    return NextResponse.json(
      {
        error: 'Esta cuenta existe en varios clubs. Elige dónde entrar.',
        tenants: matches.map((m) => ({
          id: m.tenant.id,
          name: m.tenant.name,
          url: m.tenant.url,
        })),
      },
      { status: 409 },
    )
  }

  const { tenant, user } = matches[0]
  return NextResponse.json({
    ok: true,
    tenant: { id: tenant.id, name: tenant.name, url: tenant.url },
    redirectUrl: buildSsoRedirectUrl(tenant, user),
  })
}

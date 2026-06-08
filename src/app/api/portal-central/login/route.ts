import { NextResponse } from 'next/server'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { buildSsoRedirectUrl, verifyOnTenant } from '@/lib/portal-central/login'
import { loadTenants } from '@/lib/portal-central/tenants-store'
import { getPortalSsoSecret } from '@/lib/portal-sso'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isPortalCentralHost()) {
    return NextResponse.json({ error: 'Portal central no activo en este servicio.' }, { status: 404 })
  }

  const secret = getPortalSsoSecret()
  const tenants = await loadTenants()
  if (!secret) {
    return NextResponse.json({ error: 'Falta PORTAL_SSO_SECRET.' }, { status: 503 })
  }
  if (tenants.length === 0) {
    return NextResponse.json(
      { error: 'No hay CRMs configurados. Entra a /furvoley-config' },
      { status: 503 },
    )
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

  const matches = []
  for (const tenant of tenants) {
    const hit = await verifyOnTenant(tenant, email, password, secret)
    if (hit) matches.push(hit)
  }

  if (matches.length === 0) {
    return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 })
  }

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

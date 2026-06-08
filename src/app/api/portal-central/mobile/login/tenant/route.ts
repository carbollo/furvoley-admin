import { NextResponse } from 'next/server'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { buildMobileLoginPayload, verifyOnTenant } from '@/lib/portal-central/login'
import { loadTenants } from '@/lib/portal-central/tenants-store'
import { getPortalSsoSecret } from '@/lib/portal-sso'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isPortalCentralHost()) {
    return NextResponse.json({ error: 'Portal central no activo.' }, { status: 404 })
  }

  const secret = getPortalSsoSecret()
  const tenants = await loadTenants()
  if (!secret || tenants.length === 0) {
    return NextResponse.json({ error: 'Portal no configurado.' }, { status: 503 })
  }

  let body: { tenantId?: string; email?: string; password?: string }
  try {
    body = (await request.json()) as { tenantId?: string; email?: string; password?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const tenant = tenants.find((t) => t.id === String(body.tenantId || '').trim())
  const email = String(body.email || '').trim()
  const password = String(body.password || '')
  if (!tenant) return NextResponse.json({ error: 'Club no encontrado.' }, { status: 404 })
  if (!email || !password) {
    return NextResponse.json({ error: 'Email y contraseña requeridos.' }, { status: 400 })
  }

  const hit = await verifyOnTenant(tenant, email, password, secret)
  if (!hit) return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 })

  return NextResponse.json(buildMobileLoginPayload(tenant, hit.user))
}

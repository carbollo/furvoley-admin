import { NextResponse } from 'next/server'
import {
  isPortalAdminConfigured,
  isPortalAdminRequest,
} from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { deleteTenant, loadTenants, tenantVerifyBaseUrl } from '@/lib/portal-central/tenants-store'
import { getPortalSsoSecret } from '@/lib/portal-sso'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  if (!isPortalCentralHost()) {
    return NextResponse.json({ error: 'Panel admin solo en servicio portal.' }, { status: 404 })
  }
  if (!isPortalAdminConfigured()) {
    return NextResponse.json({ error: 'Define PORTAL_ADMIN_PASSWORD.' }, { status: 503 })
  }
  if (!(await isPortalAdminRequest())) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }
  return null
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await context.params
  try {
    const tenants = await deleteTenant(decodeURIComponent(id))
    return NextResponse.json({ ok: true, tenants })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No encontrado.' },
      { status: 404 },
    )
  }
}

export async function PUT(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await context.params
  const secret = getPortalSsoSecret()
  if (!secret) return NextResponse.json({ error: 'Falta PORTAL_SSO_SECRET.' }, { status: 503 })

  const tenant = (await loadTenants()).find((t) => t.id === decodeURIComponent(id))
  if (!tenant) return NextResponse.json({ error: 'CRM no encontrado.' }, { status: 404 })

  const verifyBase = tenantVerifyBaseUrl(tenant)
  try {
    const r = await fetch(`${verifyBase}/api/portal/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: '__portal_probe__', password: '__portal_probe__' }),
    })
    if (r.status === 401) {
      return NextResponse.json({
        ok: true,
        reachable: true,
        message: 'CRM accesible (portal SSO activo).',
      })
    }
    if (r.status === 503) {
      return NextResponse.json({
        ok: false,
        reachable: true,
        message: 'CRM responde pero falta PORTAL_SSO_SECRET en ese servicio.',
      })
    }
    return NextResponse.json({
      ok: false,
      reachable: true,
      message: `CRM respondió HTTP ${r.status}.`,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({
      ok: false,
      reachable: false,
      message: `No se pudo conectar a ${verifyBase}. ${detail}. Comprueba host, puerto (:8080) y PORTAL_SSO_SECRET en el CRM.`,
    })
  }
}

import { NextResponse } from 'next/server'
import { isPortalAdminConfigured, isPortalAdminRequest } from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { listPortalAuditLogs } from '@/lib/portal-central/portal-store'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  if (!isPortalCentralHost()) {
    return NextResponse.json({ error: 'Panel admin solo en el servicio portal.' }, { status: 404 })
  }
  if (!isPortalAdminConfigured()) {
    return NextResponse.json({ error: 'Define PORTAL_ADMIN_PASSWORD.' }, { status: 503 })
  }
  if (!(await isPortalAdminRequest())) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }
  return null
}

/** Registro de acciones del super-admin. Tolera que la tabla no exista aún. */
export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  const url = new URL(request.url)
  const action = url.searchParams.get('action') || undefined
  const tenantSlug = url.searchParams.get('tenantSlug') || undefined
  const limitRaw = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined
  try {
    return NextResponse.json({ ok: true, audit: await listPortalAuditLogs({ action, tenantSlug, limit }) })
  } catch (e) {
    console.warn('[portal/audit] no se pudo leer el registro:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: true, audit: [] })
  }
}

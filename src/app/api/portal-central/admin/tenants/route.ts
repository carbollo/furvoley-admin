import { NextResponse } from 'next/server'
import {
  isPortalAdminConfigured,
  isPortalAdminRequest,
} from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { loadTenants, upsertTenant } from '@/lib/portal-central/tenants-store'

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

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return NextResponse.json({ ok: true, tenants: await loadTenants() })
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { id?: string; name?: string; url?: string; internalUrl?: string }
  try {
    body = (await request.json()) as {
      id?: string
      name?: string
      url?: string
      internalUrl?: string
    }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  try {
    const { tenant, tenants } = await upsertTenant(body)
    return NextResponse.json({ ok: true, tenant, tenants })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error al guardar.' },
      { status: 400 },
    )
  }
}

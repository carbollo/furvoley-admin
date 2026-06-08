import { NextResponse } from 'next/server'
import {
  isPortalAdminConfigured,
  isPortalAdminRequest,
  setPortalAdminSession,
  verifyPortalAdminPassword,
} from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isPortalCentralHost()) {
    return NextResponse.json({ error: 'Panel admin solo en servicio portal.' }, { status: 404 })
  }
  if (!isPortalAdminConfigured()) {
    return NextResponse.json({ error: 'Define PORTAL_ADMIN_PASSWORD en Railway.' }, { status: 503 })
  }

  let body: { password?: string }
  try {
    body = (await request.json()) as { password?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!verifyPortalAdminPassword(String(body.password || ''))) {
    return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401 })
  }

  await setPortalAdminSession()
  return NextResponse.json({ ok: true })
}

export async function GET() {
  if (!isPortalCentralHost()) {
    return NextResponse.json({ ok: false, configured: false })
  }
  return NextResponse.json({
    ok: true,
    configured: isPortalAdminConfigured(),
    authenticated: await isPortalAdminRequest(),
  })
}

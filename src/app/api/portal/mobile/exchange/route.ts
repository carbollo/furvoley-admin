import { NextResponse } from 'next/server'
import {
  isPortalSsoEnabled,
  issueMobileAccessToken,
  parsePortalSsoToken,
} from '@/lib/portal-sso'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isPortalSsoEnabled()) {
    return NextResponse.json({ error: 'Portal SSO desactivado en este servicio.' }, { status: 503 })
  }

  let body: { token?: string }
  try {
    body = (await request.json()) as { token?: string }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const token = String(body.token || '').trim()
  if (!token) {
    return NextResponse.json({ error: 'Token requerido.' }, { status: 400 })
  }

  const payload = parsePortalSsoToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Token inválido o expirado.' }, { status: 401 })
  }

  try {
    const session = await issueMobileAccessToken(payload)
    return NextResponse.json({ ok: true, ...session })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo emitir la sesión.' },
      { status: 503 },
    )
  }
}

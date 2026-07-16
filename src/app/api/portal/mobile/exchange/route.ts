import { NextResponse } from 'next/server'
import {
  isPortalSsoEnabled,
  issueMobileAccessToken,
  parsePortalSsoToken,
  ssoTokenMatchesTenant,
} from '@/lib/portal-sso'
import { isMultiTenant } from '@/lib/multitenant/registry'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { currentTenant } from '@/lib/multitenant/context'

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

  // Mismo binding que /api/portal/sso: el token debe estar ligado a ESTE club
  // (resuelto por subdominio), o si no un token del club A se canjearía aquí para
  // obtener un access-token móvil (30 días, rol ADMIN) contra el club B.
  if (isMultiTenant()) {
    await enterTenantFromRequest(request)
    const slug = currentTenant()?.slug
    if (!slug) {
      return NextResponse.json({ error: 'No se pudo resolver el club de la petición.' }, { status: 400 })
    }
    if (!ssoTokenMatchesTenant(payload, slug)) {
      return NextResponse.json({ error: 'El token no es de este club.' }, { status: 401 })
    }
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

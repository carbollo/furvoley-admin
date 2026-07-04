import { NextResponse } from 'next/server'
import {
  buildPortalSessionCookie,
  isPortalSsoEnabled,
  parsePortalSsoToken,
  resolvePortalPublicOrigin,
  type PortalSsoPayload,
} from '@/lib/portal-sso'
import { isMultiTenant } from '@/lib/multitenant/registry'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { currentTenant } from '@/lib/multitenant/context'
import { jitTenantUserSession } from '@/lib/portal-central/sso-jit'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const origin = resolvePortalPublicOrigin(request)

  if (!isPortalSsoEnabled()) {
    return NextResponse.redirect(new URL('/login?error=portal-disabled', origin))
  }

  const url = new URL(request.url)
  const token = String(url.searchParams.get('token') || '').trim()
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing-token', origin))
  }

  const payload = parsePortalSsoToken(token)
  if (!payload) {
    return NextResponse.redirect(new URL('/login?error=invalid-token', origin))
  }

  // Modelo C: activa la BD del tenant (subdominio) y materializa el usuario (JIT).
  let sessionPayload: PortalSsoPayload = payload
  if (isMultiTenant()) {
    await enterTenantFromRequest(request)
    if (!currentTenant()) {
      return NextResponse.redirect(new URL('/login?error=tenant-desconocido', origin))
    }
    try {
      sessionPayload = await jitTenantUserSession(payload)
    } catch (e) {
      console.error('[sso-jit] fallo materializando usuario del tenant:', currentTenant()?.slug, e)
      return NextResponse.redirect(new URL('/login?error=sso-jit', origin))
    }
  }

  const cookie = await buildPortalSessionCookie(sessionPayload)
  const redirectTo = sessionPayload.mustChangePassword ? '/change-password' : '/'
  const res = NextResponse.redirect(new URL(redirectTo, origin))
  res.cookies.set(cookie.name, cookie.value, cookie.options)
  return res
}

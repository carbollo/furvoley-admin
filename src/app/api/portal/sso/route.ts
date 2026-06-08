import { NextResponse } from 'next/server'
import {
  buildPortalSessionCookie,
  isPortalSsoEnabled,
  parsePortalSsoToken,
  resolvePortalPublicOrigin,
} from '@/lib/portal-sso'

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

  const cookie = await buildPortalSessionCookie(payload)
  const redirectTo = payload.mustChangePassword ? '/change-password' : '/'
  const res = NextResponse.redirect(new URL(redirectTo, origin))
  res.cookies.set(cookie.name, cookie.value, cookie.options)
  return res
}

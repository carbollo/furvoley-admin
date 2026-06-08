import { NextResponse } from 'next/server'
import {
  buildPortalSessionCookie,
  isPortalSsoEnabled,
  parsePortalSsoToken,
} from '@/lib/portal-sso'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isPortalSsoEnabled()) {
    return NextResponse.redirect(new URL('/login?error=portal-disabled', request.url))
  }

  const url = new URL(request.url)
  const token = String(url.searchParams.get('token') || '').trim()
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing-token', request.url))
  }

  const payload = parsePortalSsoToken(token)
  if (!payload) {
    return NextResponse.redirect(new URL('/login?error=invalid-token', request.url))
  }

  const cookie = await buildPortalSessionCookie(payload)
  const redirectTo = payload.mustChangePassword ? '/change-password' : '/'
  const res = NextResponse.redirect(new URL(redirectTo, request.url))
  res.cookies.set(cookie.name, cookie.value, cookie.options)
  return res
}

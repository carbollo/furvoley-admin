import { getPortalUrl } from './config'
import type { AppUser, TenantOption } from './types'

type MobileLoginOk = {
  ok: true
  tenant: { id: string; name: string; url: string }
  ssoToken: string
  user: AppUser
}

type MobileLogin409 = {
  error: string
  tenants: TenantOption[]
}

export async function portalMobileLogin(email: string, password: string, tenantId?: string) {
  const portal = getPortalUrl()
  if (!portal) throw new Error('Define EXPO_PUBLIC_PORTAL_URL')

  const path = tenantId
    ? '/api/portal-central/mobile/login/tenant'
    : '/api/portal-central/mobile/login'

  const body = tenantId ? { email, password, tenantId } : { email, password }

  const r = await fetch(`${portal}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = (await r.json().catch(() => ({}))) as MobileLoginOk | MobileLogin409 & { error?: string }

  if (r.status === 409 && Array.isArray((data as MobileLogin409).tenants)) {
    return { kind: 'pick-club' as const, ...(data as MobileLogin409) }
  }

  if (!r.ok || !(data as MobileLoginOk).ssoToken) {
    throw new Error((data as { error?: string }).error || 'No se pudo iniciar sesión')
  }

  return { kind: 'ok' as const, ...(data as MobileLoginOk) }
}

export async function exchangeSsoToken(tenantUrl: string, token: string) {
  const base = tenantUrl.replace(/\/+$/, '')
  const r = await fetch(`${base}/api/portal/mobile/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const data = (await r.json().catch(() => ({}))) as {
    ok?: boolean
    accessToken?: string
    user?: AppUser
    error?: string
  }
  if (!r.ok || !data.accessToken || !data.user) {
    throw new Error(data.error || 'No se pudo completar el acceso al club')
  }
  return {
    accessToken: data.accessToken,
    user: data.user,
  }
}

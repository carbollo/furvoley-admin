import { createPortalSsoToken, getPortalSsoSecret } from '@/lib/portal-sso'
import type { PortalTenant } from '@/lib/portal-central/tenants-store'

export async function verifyOnTenant(
  tenant: PortalTenant,
  email: string,
  password: string,
  secret: string,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const r = await fetch(`${tenant.url}/api/portal/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    })
    if (!r.ok) return null
    const data = (await r.json()) as {
      ok?: boolean
      user?: {
        userId: string
        email: string
        name: string | null
        role: string
        memberId: string | null
        mustChangePassword: boolean
      }
    }
    if (!data?.ok || !data?.user?.userId) return null
    return { tenant, user: data.user }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function buildSsoRedirectUrl(
  tenant: PortalTenant,
  user: {
    userId: string
    email: string
    name: string | null
    role: string
    memberId: string | null
    mustChangePassword: boolean
  },
) {
  const secret = getPortalSsoSecret()
  if (!secret) throw new Error('Falta PORTAL_SSO_SECRET.')
  const token = createPortalSsoToken(
    {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      memberId: user.memberId,
      mustChangePassword: user.mustChangePassword,
    },
    secret,
  )
  return `${tenant.url}/api/portal/sso?token=${encodeURIComponent(token)}`
}

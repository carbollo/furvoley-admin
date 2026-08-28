import { createPortalSsoToken, getPortalSsoSecret } from '@/lib/portal-sso'
import { sanitizeSlug } from '@/lib/multitenant/registry'
import {
  tenantPublicBaseUrl,
  tenantVerifyBaseUrl,
  type PortalTenant,
} from '@/lib/portal-central/tenants-store'

/**
 * Club al que hay que atar el token, deducido de su propia URL pública.
 *
 * Esta lista de clubes viene de variables de entorno y no trae slug, pero el
 * CRM que recibe el token resuelve el club por el subdominio del host — así que
 * es exactamente eso con lo que hay que atarlo. Sin atar, un token emitido para
 * el club A se podía canjear en el subdominio del club B con la identidad de A.
 *
 * (En producción manda `PORTAL_TENANT_MODE=true`, que usa el registro en base de
 * datos y ya ataba el slug; esto cubre el resto de despliegues.)
 */
function slugDelTenant(tenant: PortalTenant): string | null {
  try {
    const host = new URL(tenantPublicBaseUrl(tenant)).hostname
    return sanitizeSlug(host.split('.')[0])
  } catch {
    return null
  }
}

export async function verifyOnTenant(
  tenant: PortalTenant,
  email: string,
  password: string,
  secret: string,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const r = await fetch(`${tenantVerifyBaseUrl(tenant)}/api/portal/verify`, {
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
    slugDelTenant(tenant),
  )
  return `${tenantPublicBaseUrl(tenant)}/api/portal/sso?token=${encodeURIComponent(token)}`
}

export function buildMobileLoginPayload(
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
  const ssoToken = createPortalSsoToken(
    {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      memberId: user.memberId,
      mustChangePassword: user.mustChangePassword,
    },
    secret,
    slugDelTenant(tenant),
  )
  return {
    ok: true as const,
    tenant: { id: tenant.id, name: tenant.name, url: tenantPublicBaseUrl(tenant) },
    ssoToken,
    user,
  }
}

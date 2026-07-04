export function isPortalCentralHost() {
  return String(process.env.PORTAL_CENTRAL_HOST || '').trim().toLowerCase() === 'true'
}

export function getPortalAdminPath() {
  const raw = String(process.env.PORTAL_ADMIN_PATH || 'furvoley-config').trim()
  return raw.replace(/^\/+|\/+$/g, '') || 'furvoley-config'
}

export function getPortalDataDir() {
  return String(process.env.PORTAL_DATA_DIR || '/data').trim() || '/data'
}

export function getPortalPublicUrl() {
  return String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').trim()
}

/**
 * Portal en modo Modelo C: el login autentica contra el directorio del portal
 * (Tenant/PortalUser en su propia BD) y redirige al subdominio del cliente,
 * en vez del modelo antiguo de CRMs por URL.
 */
export function isPortalTenantMode() {
  return String(process.env.PORTAL_TENANT_MODE || '').trim().toLowerCase() === 'true'
}

/** Dominio base de los tenants (ej. `tudominio.com` → `club1.tudominio.com`). */
export function getTenantBaseDomain() {
  return String(process.env.TENANT_BASE_DOMAIN || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '')
}

/** URL pública de la app multi-tenant (crm-mt) para pruebas sin dominio aún. */
export function getMtAppUrl() {
  return String(process.env.MT_APP_URL || '').trim().replace(/\/+$/, '')
}

/**
 * URL de SSO al CRM del cliente. Con dominio → subdominio; sin dominio (pruebas)
 * → app MT con override `?tenant=`.
 */
export function buildTenantSsoUrl(slug: string, token: string): string {
  const enc = encodeURIComponent(token)
  const base = getTenantBaseDomain()
  if (base) return `https://${slug}.${base}/api/portal/sso?token=${enc}`
  const app = getMtAppUrl()
  if (app) return `${app}/api/portal/sso?token=${enc}&tenant=${encodeURIComponent(slug)}`
  throw new Error('Falta TENANT_BASE_DOMAIN (o MT_APP_URL para pruebas) para el redirect SSO.')
}

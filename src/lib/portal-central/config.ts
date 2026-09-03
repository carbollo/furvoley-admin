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
  const explicito = String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').trim()
  // Sin variable puesta, el dominio público que inyecta la plataforma. Importa
  // de dónde sale: NO es la cabecera `Host`, que la manda quien llama y podría
  // colar el dominio de un tercero en un correo con la contraseña de un cliente.
  // Esta la pone el proveedor de infraestructura y no se puede falsificar.
  //
  // Sin este respaldo, el enlace del correo de bienvenida salía como `/portal`
  // —una ruta relativa— y en un cliente de correo no lleva a ninguna parte: era
  // lo primero que veía cada club recién dado de alta.
  const plataforma = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim()
  const bruto = explicito || plataforma
  if (!bruto) return ''

  // La normalización va aquí, para TODAS las ramas, y no solo para la de la
  // plataforma: la que se teclea a mano es justo la que llega mal. Railway
  // enseña los dominios pelados, así que un `NEXT_PUBLIC_APP_URL=portal.club.com`
  // se devolvía tal cual y en el correo `<a href="portal.club.com/portal">` es
  // otra vez una ruta RELATIVA — el mismo enlace muerto que esto venía a matar,
  // y encima con botón, porque el correo solo mira que la cadena no esté vacía.
  const conEsquema = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`
  try {
    const u = new URL(conEsquema)
    // Un `http://localhost:3000` heredado de las pruebas no lo puede abrir quien
    // acaba de pagar: mejor sin enlace que con uno que no lleva a ninguna parte.
    if (/^(localhost|0\.0\.0\.0|\[::1\])$/i.test(u.hostname) || /^127\./.test(u.hostname)) return ''
    return `${u.origin}${u.pathname}`.replace(/\/+$/, '')
  } catch {
    return ''
  }
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

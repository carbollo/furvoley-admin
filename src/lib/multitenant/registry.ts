/**
 * Resolución de tenants (Modelo C sobre Railway).
 *
 * Infra: UN servidor Postgres en Railway con UNA base de datos por cliente
 * (misma URL base, distinto nombre de BD: `tenant_<slug>`). Cada cliente vive
 * en su subdominio `slug.tudominio.com`.
 *
 * Mientras `MULTITENANT` no sea "true", todo funciona en modo un-solo-club
 * (con `DATABASE_URL`), sin ningún cambio de comportamiento.
 */

/** ¿Está activo el modo multi-tenant? */
export function isMultiTenant(): boolean {
  return String(process.env.MULTITENANT || '').trim().toLowerCase() === 'true'
}

/**
 * En multi-tenant, exigir contexto de tenant por defecto: si una operación de
 * BD se ejecuta sin tenant activo, falla en vez de caer a una BD por defecto
 * (evita fugas entre clientes). Se puede relajar con `TENANT_STRICT=false`.
 */
export function tenantStrict(): boolean {
  return String(process.env.TENANT_STRICT || 'true').trim().toLowerCase() !== 'false'
}

/** Normaliza un slug de tenant (subdominio) a `[a-z0-9-]`. */
export function sanitizeSlug(raw: string | null | undefined): string | null {
  const s = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  if (!s) return null
  // Subdominios reservados del portal/infra: no son tenants.
  const reserved = new Set(['www', 'app', 'portal', 'acceso', 'login', 'admin', 'api', 'static', 'assets'])
  if (reserved.has(s)) return null
  return s
}

/** Slug del tenant a partir del host de la petición (primer label del subdominio). */
export function tenantSlugFromHost(host: string | null | undefined): string | null {
  const h = String(host || '').split(':')[0].trim().toLowerCase()
  if (!h) return null

  const base = String(process.env.TENANT_BASE_DOMAIN || '').trim().toLowerCase()
  if (base) {
    if (h === base) return null // dominio raíz = portal, no un tenant
    if (h.endsWith(`.${base}`)) {
      const sub = h.slice(0, h.length - base.length - 1)
      return sanitizeSlug(sub.split('.')[0])
    }
    return null
  }

  // Sin dominio base configurado: solo tratamos como tenant si hay subdominio real.
  const parts = h.split('.')
  if (parts.length >= 3) return sanitizeSlug(parts[0])
  return null
}

/** Nombre de la base de datos del tenant en el servidor Postgres compartido. */
export function tenantDbName(slug: string): string {
  const prefix = String(process.env.TENANT_DB_PREFIX || 'tenant_').trim() || 'tenant_'
  return `${prefix}${slug.replace(/-/g, '_')}`
}

/**
 * URL de conexión de la BD del tenant, derivada de `TENANT_DB_BASE_URL`
 * cambiando solo el nombre de la base de datos. Devuelve null si falta config.
 */
export function tenantDbUrl(slug: string | null | undefined): string | null {
  const clean = sanitizeSlug(slug)
  if (!clean) return null
  const base = String(process.env.TENANT_DB_BASE_URL || '').trim()
  if (!base) return null
  try {
    const u = new URL(base)
    u.pathname = `/${tenantDbName(clean)}`
    return u.toString()
  } catch {
    return null
  }
}

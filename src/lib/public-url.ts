import { currentTenant } from '@/lib/multitenant/context'
import { isMultiTenant } from '@/lib/multitenant/registry'

/** URL base pública de la app, sin barra final. */
export function appBaseUrl() {
  const explicit = String(process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (explicit) return explicit
  const railway = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim()
  if (railway) return (railway.startsWith('http') ? railway : `https://${railway}`).replace(/\/+$/, '')
  return 'http://localhost:3000'
}

/**
 * URL pública absoluta de `path`, codificando el tenant cuando hace falta: en
 * multi-tenant los datos viven en la BD del club, así que el enlace debe decir
 * de qué club es. Con dominio comodín → `slug.dominio`; sin él (pruebas) →
 * `?tenant=slug`, que el middleware resuelve por override. Un-solo-club → base.
 */
export function buildTenantPublicUrl(path: string) {
  const slug = currentTenant()?.slug
  if (isMultiTenant() && slug) {
    const base = String(process.env.TENANT_BASE_DOMAIN || '')
      .trim().toLowerCase().replace(/^\.+|\.+$/g, '')
    if (base) return `https://${slug}.${base}${path}`
    return `${appBaseUrl()}${path}?tenant=${encodeURIComponent(slug)}`
  }
  return `${appBaseUrl()}${path}`
}

/**
 * ¿Es una URL que un servicio externo puede descargar? En local (`localhost`)
 * no lo es: pasársela a un tercero solo genera un error de descarga.
 */
export function isPubliclyFetchable(url: string) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(u.hostname)
  } catch {
    return false
  }
}

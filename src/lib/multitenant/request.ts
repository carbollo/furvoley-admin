import { cookies, headers } from 'next/headers'
import { enterTenant, withTenant, type TenantContext } from '@/lib/multitenant/context'
import {
  isMultiTenant,
  sanitizeSlug,
  tenantDbUrl,
  tenantSlugFromHost,
} from '@/lib/multitenant/registry'

const TENANT_ALLOW_OVERRIDE =
  String(process.env.TENANT_ALLOW_OVERRIDE || '').trim().toLowerCase() === 'true'

/**
 * Activa el tenant de la petición actual leyendo la cabecera `x-tenant-slug`
 * (la fija el middleware de forma autoritativa desde el subdominio; nunca se
 * confía en una cabecera enviada por el cliente).
 *
 * IMPORTANTE (AsyncLocalStorage): la activación usa `enterWith`, que solo llega
 * al código que espera (`await requireRoles(...)`) si se ejecuta de forma
 * SÍNCRONA antes del primer `await`. Por eso el camino fiable es el `request`
 * pasado por el handler (`request.headers` es síncrono). Los handlers que llaman
 * a `requireRoles([...])` deben pasar `request`. Para renders de servidor (RSC)
 * usa `runWithTenant(...)`, que envuelve con `als.run` (propaga a través de awaits).
 *
 * No-op si el modo multi-tenant está apagado o si no hay slug (dominio raíz /
 * portal / despliegue un-solo-club).
 */
export async function enterTenantFromRequest(request?: Request): Promise<void> {
  if (!isMultiTenant()) return

  let slug: string | null | undefined = sanitizeSlug(request?.headers.get('x-tenant-slug'))
  if (!slug) {
    try {
      const h = await headers()
      slug = sanitizeSlug(h.get('x-tenant-slug'))
    } catch {
      // Fuera de contexto de petición: nada que activar.
    }
  }
  if (!slug) return

  const dbUrl = tenantDbUrl(slug)
  if (!dbUrl) return

  enterTenant({ slug, dbUrl })
}

/**
 * Activación SÍNCRONA del tenant a partir de un objeto de cabeceras plano
 * (p. ej. el `req.headers` que NextAuth pasa a `authorize`). Debe llamarse antes
 * del primer `await` para que `enterWith` alcance las consultas posteriores.
 *
 * Resuelve el slug por: `x-tenant-slug` → cookie `furvoley-tenant` (solo en
 * pruebas) → subdominio del `host`. Imprescindible para el login por credenciales
 * (socios/admin del club en `club.tudominio.com/login`), que no pasa por el
 * middleware.
 */
export function enterTenantFromHeaders(
  h: Record<string, string | string[] | undefined> | undefined | null,
): void {
  if (!isMultiTenant() || !h) return
  const get = (k: string) => {
    const v = h[k] ?? h[k.toLowerCase()]
    return Array.isArray(v) ? v[0] : v
  }
  let slug = sanitizeSlug(get('x-tenant-slug'))
  if (!slug && TENANT_ALLOW_OVERRIDE) {
    const cookie = String(get('cookie') || '')
    const m = cookie.match(/(?:^|;\s*)furvoley-tenant=([^;]+)/)
    if (m) slug = sanitizeSlug(decodeURIComponent(m[1]))
  }
  if (!slug) slug = tenantSlugFromHost(get('host'))
  if (!slug) return
  const dbUrl = tenantDbUrl(slug)
  if (!dbUrl) return
  enterTenant({ slug, dbUrl })
}

/**
 * Resuelve el tenant de la petición actual a partir de señales FIABLES en
 * `headers()`/`cookies()` (que sí exponen host y cookies originales, a diferencia
 * de las cabeceras inyectadas por el middleware):
 *   1. `x-tenant-slug` (por si el runtime la expone),
 *   2. cookie `furvoley-tenant` (solo en modo pruebas, `TENANT_ALLOW_OVERRIDE`),
 *   3. subdominio del host.
 */
async function resolveTenantCtx(): Promise<TenantContext | null> {
  try {
    const h = await headers()
    let slug = sanitizeSlug(h.get('x-tenant-slug'))
    if (!slug && TENANT_ALLOW_OVERRIDE) {
      const jar = await cookies()
      slug = sanitizeSlug(jar.get('furvoley-tenant')?.value)
    }
    if (!slug) slug = tenantSlugFromHost(h.get('host'))
    if (!slug) return null
    const dbUrl = tenantDbUrl(slug)
    return dbUrl ? { slug, dbUrl } : null
  } catch {
    return null
  }
}

/**
 * Ejecuta `fn` (un render de servidor / RSC) dentro del contexto del tenant de la
 * petición, usando `withTenant` (`als.run`), que propaga el tenant a TODAS las
 * consultas Prisma que `fn` haga a través de sus awaits. Úsalo para envolver el
 * cuerpo de páginas y componentes de servidor que consulten la BD en el render.
 *
 * No-op (ejecuta `fn` tal cual) si el modo multi-tenant está apagado o si no hay
 * tenant resoluble (dominio raíz / portal / un-solo-club).
 */
export async function runWithTenant<T>(fn: () => Promise<T>): Promise<T> {
  if (!isMultiTenant()) return fn()
  const ctx = await resolveTenantCtx()
  return ctx ? withTenant(ctx, fn) : fn()
}

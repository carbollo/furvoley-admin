import { headers } from 'next/headers'
import { enterTenant } from '@/lib/multitenant/context'
import { isMultiTenant, sanitizeSlug, tenantDbUrl } from '@/lib/multitenant/registry'

/**
 * Activa el tenant de la petición actual leyendo la cabecera `x-tenant-slug`
 * (la fija el middleware de forma autoritativa desde el subdominio; nunca se
 * confía en una cabecera enviada por el cliente).
 *
 * IMPORTANTE (AsyncLocalStorage): la activación usa `enterWith`, que solo llega
 * al código que espera (`await requireRoles(...)`) si se ejecuta de forma
 * SÍNCRONA antes del primer `await`. Por eso el camino fiable es el `request`
 * pasado por el handler (`request.headers` es síncrono). El fallback a
 * `await headers()` sirve para renders de página (RSC), donde no hay awaiter
 * intermedio, pero NO para handlers que llaman a `requireRoles([...])` sin
 * `request`: esos deben pasar el `request`.
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

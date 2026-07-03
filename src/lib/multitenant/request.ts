import { headers } from 'next/headers'
import { enterTenant } from '@/lib/multitenant/context'
import { isMultiTenant, tenantDbUrl } from '@/lib/multitenant/registry'

/**
 * Activa el tenant de la petición actual leyendo la cabecera `x-tenant-slug`
 * (la fija el middleware de forma autoritativa desde el subdominio; nunca se
 * confía en una cabecera enviada por el cliente).
 *
 * No-op si el modo multi-tenant está apagado o si no hay slug (dominio raíz /
 * portal / despliegue un-solo-club). Pensada para llamarse una vez al inicio
 * de la petición (dentro de requireRoles), usando `enterWith` para que el
 * tenant quede activo en el resto del handler.
 */
export async function enterTenantFromRequest(request?: Request): Promise<void> {
  if (!isMultiTenant()) return

  let slug: string | null | undefined = request?.headers.get('x-tenant-slug')
  if (!slug) {
    try {
      const h = await headers()
      slug = h.get('x-tenant-slug')
    } catch {
      // Fuera de contexto de petición: nada que activar.
    }
  }
  if (!slug) return

  const dbUrl = tenantDbUrl(slug)
  if (!dbUrl) return

  enterTenant({ slug, dbUrl })
}

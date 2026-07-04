import { cookies, headers } from 'next/headers'
import { enterTenant } from '@/lib/multitenant/context'
import {
  isMultiTenant,
  sanitizeSlug,
  tenantDbUrl,
  tenantSlugFromHost,
} from '@/lib/multitenant/registry'

const TENANT_ALLOW_OVERRIDE =
  String(process.env.TENANT_ALLOW_OVERRIDE || '').trim().toLowerCase() === 'true'

/**
 * Activa el tenant de la petición actual.
 *
 * Orden de resolución:
 *   1. Si llega `request`, la cabecera `x-tenant-slug` que fija el middleware
 *      (ruta rápida; la cabecera inyectada SÍ viaja en el objeto Request).
 *   2. Si no, se resuelve desde las señales ORIGINALES de la petición —
 *      `host` y la cookie de override— leídas con `headers()`/`cookies()`. Esto
 *      es imprescindible porque las cabeceras que el middleware inyecta vía
 *      `NextResponse.next({request:{headers}})` NO se exponen de forma fiable
 *      en `headers()` en este runtime, y muchos handlers GET llaman a
 *      `requireRoles([...])` sin pasar `request`.
 *
 * Nunca confía en una cabecera `x-tenant-slug` enviada por el cliente (el
 * middleware la elimina). No-op si el modo multi-tenant está apagado o si no hay
 * tenant (dominio raíz / portal / despliegue un-solo-club).
 */
export async function enterTenantFromRequest(request?: Request): Promise<void> {
  if (!isMultiTenant()) return

  let slug: string | null | undefined = request?.headers.get('x-tenant-slug')

  if (!slug) {
    slug = await resolveSlugFromContext()
  }
  if (!slug) return

  const dbUrl = tenantDbUrl(slug)
  if (!dbUrl) return

  enterTenant({ slug, dbUrl })
}

/**
 * Resuelve el slug con las mismas reglas que el middleware, pero leyendo solo
 * señales originales (fiables en `headers()`/`cookies()`): en modo pruebas el
 * override explícito (cookie `furvoley-tenant`) manda; si no, el subdominio del
 * host.
 */
async function resolveSlugFromContext(): Promise<string | null> {
  try {
    const h = await headers()

    // Por si el runtime sí expone la cabecera inyectada por el middleware.
    const injected = sanitizeSlug(h.get('x-tenant-slug'))
    if (injected) return injected

    if (TENANT_ALLOW_OVERRIDE) {
      const jar = await cookies()
      const override = sanitizeSlug(jar.get('furvoley-tenant')?.value)
      if (override) return override
    }

    return tenantSlugFromHost(h.get('host'))
  } catch {
    // Fuera de contexto de petición: nada que activar.
    return null
  }
}

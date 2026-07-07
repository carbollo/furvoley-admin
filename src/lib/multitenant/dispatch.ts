import { Client } from 'pg'
import { isMultiTenant, tenantDbUrl } from '@/lib/multitenant/registry'
import { withTenant } from '@/lib/multitenant/context'

// BD del portal (directorio de clientes) en el servidor Postgres compartido.
const PORTAL_DB_NAME = String(process.env.PORTAL_DB_NAME || 'portal').trim() || 'portal'

/**
 * Slugs de los tenants ACTIVE, leídos del directorio autoritativo (tabla Tenant
 * de la BD del portal). Usamos el slug real —no el derivado del nombre de BD—
 * porque `tenant_<slug>` reemplaza guiones por «_» y no es reversible.
 */
async function listActiveTenantSlugs(): Promise<string[]> {
  const base = String(process.env.TENANT_DB_BASE_URL || '').trim()
  if (!base) return []
  const u = new URL(base)
  u.pathname = `/${PORTAL_DB_NAME}`
  const client = new Client({ connectionString: u.toString() })
  await client.connect()
  try {
    const res = await client.query(`SELECT slug FROM "Tenant" WHERE status = 'ACTIVE' ORDER BY slug`)
    return res.rows.map((r) => String(r.slug)).filter(Boolean)
  } finally {
    await client.end().catch(() => {})
  }
}

export type TenantRunResult<T> = {
  slug: string
  ok: boolean
  value?: T
  error?: string
}

/**
 * Ejecuta `fn` una vez por cada tenant ACTIVE (Modelo C), dentro del contexto de
 * su BD (`withTenant` → als.run, que propaga el tenant a todas las consultas
 * Prisma dentro de fn). En modo un-solo-club (MULTITENANT apagado) ejecuta
 * `fn(null)` una sola vez con la BD por defecto. Un fallo en un tenant se captura
 * y NO interrumpe al resto. Pensado para tareas de fondo (cron).
 */
export async function forEachTenant<T>(
  fn: (slug: string | null) => Promise<T>,
): Promise<TenantRunResult<T>[]> {
  if (!isMultiTenant()) {
    try {
      return [{ slug: '(default)', ok: true, value: await fn(null) }]
    } catch (e) {
      return [{ slug: '(default)', ok: false, error: e instanceof Error ? e.message : String(e) }]
    }
  }

  const slugs = await listActiveTenantSlugs()
  const results: TenantRunResult<T>[] = []
  for (const slug of slugs) {
    const dbUrl = tenantDbUrl(slug)
    if (!dbUrl) {
      results.push({ slug, ok: false, error: 'No se pudo resolver la URL de la BD del tenant.' })
      continue
    }
    try {
      const value = await withTenant({ slug, dbUrl }, () => fn(slug))
      results.push({ slug, ok: true, value })
    } catch (e) {
      results.push({ slug, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return results
}

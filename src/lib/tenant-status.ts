import { Client } from 'pg'
import { isMultiTenant } from '@/lib/multitenant/registry'

/**
 * Estado de un club (ACTIVE | SUSPENDED) leído desde la BD del PORTAL.
 *
 * El status vive en la tabla Tenant de la BD del portal, no en la del club. En
 * crm-mt `prisma` resuelve a la BD del club (y lanza fuera de tenant), así que
 * aquí se lee con un pg Client directo, igual que el snapshot y el log de errores.
 *
 * Se cachea en memoria con TTL corto por slug: el gate de login se llama en cada
 * intento, y suspender/reactivar tarda como mucho el TTL en propagarse.
 */

const PORTAL_DB_NAME = String(process.env.PORTAL_DB_NAME || 'portal').trim() || 'portal'
const CACHE_TTL_MS = 30_000
const CACHE_MAX = 500 // cota: el slug sale del Host, no confiable — no crecer sin límite

type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'UNKNOWN'
const cache = new Map<string, { status: TenantStatus; at: number }>()

function portalDbUrl(): string | null {
  const base = String(process.env.TENANT_DB_BASE_URL || '').trim()
  if (!base) return null
  const u = new URL(base)
  u.pathname = `/${PORTAL_DB_NAME}`
  return u.toString()
}

async function readStatus(slug: string): Promise<TenantStatus> {
  const url = portalDbUrl()
  if (!url) return 'UNKNOWN'
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 4000,
    query_timeout: 4000,
    statement_timeout: 4000,
  })
  client.on('error', (e) => console.warn('[tenant-status] pg client error:', e instanceof Error ? e.message : e))
  try {
    await client.connect()
    const r = await client.query('SELECT status FROM "Tenant" WHERE slug = $1 LIMIT 1', [slug])
    const status = String(r.rows[0]?.status || '').toUpperCase()
    return status === 'SUSPENDED' ? 'SUSPENDED' : status === 'ACTIVE' ? 'ACTIVE' : 'UNKNOWN'
  } catch (e) {
    console.warn('[tenant-status] no se pudo leer el estado del club:', e instanceof Error ? e.message : e)
    return 'UNKNOWN'
  } finally {
    await client.end().catch(() => {})
  }
}

/** Estado del club (cacheado). 'UNKNOWN' si no se pudo determinar. */
export async function getTenantStatus(slug: string): Promise<TenantStatus> {
  if (!isMultiTenant() || !slug) return 'ACTIVE' // un-solo-club: sin concepto de suspensión
  const hit = cache.get(slug)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.status
  const status = await readStatus(slug)
  // Cota simple: al llenarse, descarta la entrada más antigua (Map conserva el
  // orden de inserción). El TTL ya evita servir estados viejos.
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(slug, { status, at: Date.now() })
  return status
}

/**
 * ¿Está el club suspendido? Solo devuelve true si lo sabemos con certeza
 * (fail-open): un fallo de la BD del portal NO debe dejar a todos sin entrar.
 */
export async function isTenantSuspended(slug: string): Promise<boolean> {
  return (await getTenantStatus(slug)) === 'SUSPENDED'
}

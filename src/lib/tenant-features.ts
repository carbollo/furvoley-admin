import { Client } from 'pg'
import { isMultiTenant } from '@/lib/multitenant/registry'
import { sanitizeFeatures, type TenantFeatures } from '@/lib/crm-modules'

/**
 * Módulos activados de un club (feature flags), leídos de la BD del PORTAL.
 *
 * Igual que el estado de suspensión (tenant-status): el campo vive en la tabla
 * Tenant de la BD del portal, y en crm-mt `prisma` apunta a la BD del club (y
 * lanza fuera de tenant), así que se lee con un pg Client directo, con caché de
 * TTL corto (un cambio de plan tarda como mucho el TTL en propagarse).
 */

const PORTAL_DB_NAME = String(process.env.PORTAL_DB_NAME || 'portal').trim() || 'portal'
const CACHE_TTL_MS = 30_000
const CACHE_MAX = 500

const cache = new Map<string, { features: TenantFeatures; at: number }>()

function portalDbUrl(): string | null {
  const base = String(process.env.TENANT_DB_BASE_URL || '').trim()
  if (!base) return null
  const u = new URL(base)
  u.pathname = `/${PORTAL_DB_NAME}`
  return u.toString()
}

async function readFeatures(slug: string): Promise<TenantFeatures> {
  const url = portalDbUrl()
  if (!url) return {}
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 4000,
    query_timeout: 4000,
    statement_timeout: 4000,
  })
  client.on('error', (e) => console.warn('[tenant-features] pg client error:', e instanceof Error ? e.message : e))
  try {
    await client.connect()
    const r = await client.query('SELECT features FROM "Tenant" WHERE slug = $1 LIMIT 1', [slug])
    return sanitizeFeatures(r.rows[0]?.features)
  } catch (e) {
    console.warn('[tenant-features] no se pudieron leer los módulos del club:', e instanceof Error ? e.message : e)
    return {} // fail-open: ante un fallo, no ocultes módulos
  } finally {
    await client.end().catch(() => {})
  }
}

/** Módulos activados del club (cacheado). {} = todos activados (por defecto). */
export async function getTenantFeatures(slug: string | null | undefined): Promise<TenantFeatures> {
  const clean = String(slug || '').trim()
  if (!isMultiTenant() || !clean) return {} // un-solo-club: todo activado
  const hit = cache.get(clean)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.features
  const features = await readFeatures(clean)
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(clean, { features, at: Date.now() })
  return features
}

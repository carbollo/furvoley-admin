import { Client } from 'pg'
import { isMultiTenant } from '@/lib/multitenant/registry'
import { currentTenant } from '@/lib/multitenant/context'

/**
 * Registro `company de la pasarela → club` en la BD del portal.
 *
 * Sirve para dos cosas:
 *  1. Que el webhook (único, en la cuenta plataforma) sepa a qué club pertenece
 *     cada evento de cobro.
 *  2. Impedir que DOS clubes conecten la misma cuenta de la pasarela: sus pagos
 *     se conciliarían en el club equivocado. El `@unique` de la columna lo
 *     garantiza a nivel de BD.
 *
 * El CRM (crm-mt) no puede usar `prisma` para la BD del portal (el proxy enruta
 * al club activo), así que se conecta directamente — mismo patrón que el cron de
 * KPIs cross-club.
 */

const PORTAL_DB_NAME = String(process.env.PORTAL_DB_NAME || 'portal').trim() || 'portal'

function portalDbUrl(): string | null {
  const base = String(process.env.TENANT_DB_BASE_URL || '').trim()
  if (!base) return null
  try {
    const u = new URL(base)
    u.pathname = `/${PORTAL_DB_NAME}`
    return u.toString()
  } catch {
    return null
  }
}

export type ClaimResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; reason: 'taken' | 'unavailable'; message: string }

/**
 * Asigna la company al club activo. Falla si otro club ya la tiene (fail-closed:
 * es preferible no conectar a conciliar cobros en el club equivocado).
 */
export async function claimWhopCompany(companyId: string): Promise<ClaimResult> {
  // En modo un-solo-club no hay directorio de clubes que actualizar.
  if (!isMultiTenant()) return { ok: true, skipped: true }

  const slug = currentTenant()?.slug || ''
  const url = portalDbUrl()
  if (!slug || !url) return { ok: true, skipped: true }

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 8000 })
  try {
    await client.connect()
  } catch {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'No se pudo registrar la cuenta ahora mismo. Inténtalo de nuevo en unos segundos.',
    }
  }
  try {
    // ¿La tiene ya otro club?
    const existing = await client.query(
      'SELECT slug FROM "Tenant" WHERE "whopCompanyId" = $1 LIMIT 1',
      [companyId],
    )
    const owner = existing.rows[0]?.slug
    if (owner && owner !== slug) {
      return {
        ok: false,
        reason: 'taken',
        message: 'Esa cuenta de la pasarela ya está conectada a otro club. Usa una cuenta distinta.',
      }
    }
    await client.query('UPDATE "Tenant" SET "whopCompanyId" = $1 WHERE slug = $2', [companyId, slug])
    return { ok: true }
  } catch {
    // La columna puede no existir aún (portal sin migrar): no se bloquea la
    // conexión por esto, pero se deja constancia en el log del servidor.
    console.warn('[whop] No se pudo registrar la company en el directorio del portal.')
    return { ok: true, skipped: true }
  } finally {
    await client.end().catch(() => {})
  }
}

/** Marca de "instalación de un solo club": no hay directorio que consultar. */
export const SINGLE_CLUB = '__single__'

export type TenantLookup =
  | { status: 'found'; slug: string }
  /** Esa cuenta no está conectada a ningún club. */
  | { status: 'not_found' }
  /** No se pudo consultar el directorio: NO es lo mismo que "no existe". */
  | { status: 'unavailable' }

/**
 * Club dueño de una cuenta de la pasarela: así sabe el webhook ÚNICO en qué BD
 * conciliar cada cobro.
 *
 * Distingue "no conectada" de "no se pudo comprobar": confundirlas haría que un
 * fallo pasajero de la BD del portal descartara cobros reales para siempre.
 */
export async function findTenantByWhopCompany(companyId: string): Promise<TenantLookup> {
  const id = String(companyId || '').trim()
  if (!id) return { status: 'not_found' }
  // En un-solo-club el evento se valida contra la config local, sin directorio.
  if (!isMultiTenant()) return { status: 'found', slug: SINGLE_CLUB }

  const url = portalDbUrl()
  if (!url) return { status: 'unavailable' }

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 8000 })
  try {
    await client.connect()
    const r = await client.query('SELECT slug FROM "Tenant" WHERE "whopCompanyId" = $1 LIMIT 1', [id])
    const slug = r.rows[0]?.slug
    return slug ? { status: 'found', slug: String(slug) } : { status: 'not_found' }
  } catch (e) {
    console.error('[whop] no se pudo consultar el directorio de clubes', e)
    return { status: 'unavailable' }
  } finally {
    await client.end().catch(() => {})
  }
}

/** Libera la company del club activo (al desconectar la pasarela). */
export async function releaseWhopCompany(): Promise<void> {
  if (!isMultiTenant()) return
  const slug = currentTenant()?.slug || ''
  const url = portalDbUrl()
  if (!slug || !url) return

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 8000 })
  try {
    await client.connect()
    await client.query('UPDATE "Tenant" SET "whopCompanyId" = NULL WHERE slug = $1', [slug])
  } catch {
    console.warn('[whop] No se pudo liberar la company en el directorio del portal.')
  } finally {
    await client.end().catch(() => {})
  }
}

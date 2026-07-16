import { Client } from 'pg'
import { createHash, randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { currentTenant, withTenant } from '@/lib/multitenant/context'
import { isMultiTenant, sanitizeSlug, tenantDbUrl, tenantSlugFromHost } from '@/lib/multitenant/registry'

/**
 * Registro de errores por club (Fase 2).
 *
 * Reglas de oro (Modelo C):
 * - Se escribe en la BD del CLUB (tabla ErrorLog) con prisma dentro de withTenant.
 * - Los errores ERROR/FATAL se reenvían además a la bandeja CENTRAL del portal
 *   (PortalErrorLog) con un pg Client directo — nunca prisma (fuera de withTenant
 *   prisma lanzaría; con withTenant apuntaría a la BD del club).
 * - Todo va envuelto en try/catch que solo hace console.warn y NUNCA relanza: el
 *   logger de errores no puede convertirse en una nueva fuente de errores.
 * - Dedup por `fingerprint` (huella del error normalizado) para no inundar.
 */

export type ErrorLevel = 'WARN' | 'ERROR' | 'FATAL'

export type LogAppErrorInput = {
  error: unknown
  /** Origen: 'onRequestError' | 'cron:snapshot' | 'workflow:whatsapp' | … */
  source: string
  level?: ErrorLevel
  /** Slug del club; si se omite se usa el tenant activo (currentTenant). */
  slug?: string | null
  route?: string
  method?: string
  routeType?: string
  digest?: string
  context?: Record<string, unknown>
  userId?: string | null
  userEmail?: string | null
  memberId?: string | null
}

const PORTAL_DB_NAME = String(process.env.PORTAL_DB_NAME || 'portal').trim() || 'portal'

function portalDbUrl(): string | null {
  const base = String(process.env.TENANT_DB_BASE_URL || '').trim()
  if (!base) return null
  const u = new URL(base)
  u.pathname = `/${PORTAL_DB_NAME}`
  return u.toString()
}

/**
 * Acota una promesa: si no resuelve en `ms`, rechaza. Imprescindible aquí porque
 * `logAppError` se llama (y se espera) dentro de onRequestError: una BD caída sin
 * timeout de driver colgaría la respuesta y retendría conexiones en una tormenta
 * de errores. La operación subyacente puede seguir, pero dejamos de esperarla.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`[error-log] timeout ${label} (${ms}ms)`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

type ExtractedError = { name: string | null; message: string; stack: string | null }

function extractError(error: unknown): ExtractedError {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: String(error.message || error.name || 'Error').slice(0, 4000),
      stack: error.stack ? String(error.stack).slice(0, 8000) : null,
    }
  }
  if (typeof error === 'string') return { name: null, message: error.slice(0, 4000), stack: null }
  try {
    return { name: null, message: JSON.stringify(error).slice(0, 4000), stack: null }
  } catch {
    return { name: null, message: String(error).slice(0, 4000), stack: null }
  }
}

/**
 * Normaliza el mensaje para agrupar variantes del mismo error: quita ids
 * (cuid/uuid/hex largos), números y fechas ISO, que si no crearían una fila
 * nueva por cada "Socio abc123 no encontrado" y anularían el contador.
 */
function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '<uuid>') // uuid
    .replace(/\bc[0-9a-z]{20,}\b/g, '<cuid>') // cuid
    .replace(/\b[0-9a-f]{16,}\b/g, '<hex>') // hex largo
    .replace(/\d{4}-\d{2}-\d{2}t[\d:.]+z?/g, '<date>') // ISO date
    .replace(/\b\d+\b/g, '<n>') // números
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

function fingerprintOf(source: string, route: string | undefined, message: string): string {
  const basis = `${source}|${route || ''}|${normalizeMessage(message)}`
  return createHash('sha256').update(basis).digest('hex').slice(0, 32)
}

/** Escribe/actualiza la fila en la BD del club. Best-effort. */
async function writeToClub(slug: string, row: {
  fingerprint: string
  level: ErrorLevel
  source: string
  ex: ExtractedError
  digest?: string
  route?: string
  method?: string
  routeType?: string
  context?: Record<string, unknown>
  userId?: string | null
  userEmail?: string | null
  memberId?: string | null
}): Promise<void> {
  const dbUrl = tenantDbUrl(slug)
  if (!dbUrl) return
  try {
    await withTimeout(
      withTenant({ slug, dbUrl }, () =>
      prisma.errorLog.upsert({
        where: { fingerprint: row.fingerprint },
        create: {
          fingerprint: row.fingerprint,
          level: row.level,
          source: row.source,
          name: row.ex.name,
          message: row.ex.message,
          stack: row.ex.stack,
          digest: row.digest ?? null,
          route: row.route ?? null,
          method: row.method ?? null,
          routeType: row.routeType ?? null,
          context: (row.context ?? undefined) as never,
          userId: row.userId ?? null,
          userEmail: row.userEmail ?? null,
          memberId: row.memberId ?? null,
        },
        update: {
          count: { increment: 1 },
          lastSeenAt: new Date(),
          level: row.level,
          message: row.ex.message,
          stack: row.ex.stack,
          resolved: false, // si reaparece tras marcarse resuelto, vuelve a abrirse
        },
      }),
      ),
      6000,
      'club',
    )
  } catch (e) {
    console.warn('[error-log] no se pudo escribir en la BD del club:', e instanceof Error ? e.message : e)
  }
}

/** Reenvía el error a la bandeja central del portal (pg directo). Best-effort. */
async function forwardToPortal(slug: string, row: {
  fingerprint: string
  level: ErrorLevel
  source: string
  ex: ExtractedError
  route?: string
  context?: Record<string, unknown>
}): Promise<void> {
  const url = portalDbUrl()
  if (!url) return
  // Timeouts de driver: sin ellos, una BD del portal inalcanzable colgaría el
  // `connect()`/query hasta el timeout TCP del SO. El listener 'error' evita que
  // un fallo de conexión asíncrono (reset/cierre del backend) emita un evento
  // no capturado que tumbaría el proceso — el logger jamás debe crashear.
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 4000,
    query_timeout: 5000,
    statement_timeout: 5000,
  })
  client.on('error', (e) => console.warn('[error-log] pg client error:', e instanceof Error ? e.message : e))
  try {
    await withTimeout(client.connect(), 5000, 'portal-connect')
    // Nombre del club (denormalizado para el listado sin JOIN); best-effort.
    let tenantName: string | null = null
    try {
      const r = await client.query('SELECT name FROM "Tenant" WHERE slug = $1 LIMIT 1', [slug])
      tenantName = r.rows[0]?.name ?? null
    } catch {
      /* la tabla siempre existe en el portal; si falla, seguimos sin nombre */
    }
    await client.query(
      `INSERT INTO "PortalErrorLog"
         ("id","tenantSlug","tenantName","fingerprint","level","source","name",
          "message","route","stack","context","count","resolved",
          "firstSeenAt","lastSeenAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7, $8,$9,$10,$11, 1, false, now(), now(), now(), now())
       ON CONFLICT ("tenantSlug","fingerprint") DO UPDATE SET
         "count" = "PortalErrorLog"."count" + 1,
         "lastSeenAt" = now(),
         "updatedAt" = now(),
         "level" = EXCLUDED."level",
         "message" = EXCLUDED."message",
         "stack" = EXCLUDED."stack",
         "tenantName" = COALESCE(EXCLUDED."tenantName", "PortalErrorLog"."tenantName"),
         "resolved" = false`,
      [
        randomUUID(),
        slug,
        tenantName,
        row.fingerprint,
        row.level,
        row.source,
        row.ex.name,
        row.ex.message,
        row.route ?? null,
        row.ex.stack,
        row.context ? JSON.stringify(row.context) : null,
      ],
    )
  } catch (e) {
    console.warn('[error-log] no se pudo reenviar al portal:', e instanceof Error ? e.message : e)
  } finally {
    await client.end().catch(() => {})
  }
}

/**
 * Registra un error del CRM. A prueba de balas: nunca lanza. Escribe en la BD del
 * club y, si es ERROR/FATAL, en la bandeja central del portal.
 */
export async function logAppError(input: LogAppErrorInput): Promise<void> {
  try {
    // En un-solo-club no hay bandeja central ni BD de tenant separada; el error
    // ya sale por consola. (El dashboard/errores cross-club es solo multi-tenant.)
    if (!isMultiTenant()) return

    const level: ErrorLevel = input.level ?? 'ERROR'
    const slug = sanitizeSlug(input.slug ?? currentTenant()?.slug ?? null)
    const ex = extractError(input.error)
    const fingerprint = fingerprintOf(input.source, input.route, ex.message)

    // 1) BD del club (solo si sabemos de qué club es).
    if (slug) {
      await writeToClub(slug, {
        fingerprint,
        level,
        source: input.source,
        ex,
        digest: input.digest,
        route: input.route,
        method: input.method,
        routeType: input.routeType,
        context: input.context,
        userId: input.userId,
        userEmail: input.userEmail,
        memberId: input.memberId,
      })
    }

    // 2) Bandeja central del portal, solo lo grave. Sin club conocido, se marca
    //    como '(desconocido)' para no perderlo (p. ej. errores de proceso).
    if (level === 'ERROR' || level === 'FATAL') {
      await forwardToPortal(slug || '(desconocido)', {
        fingerprint,
        level,
        source: input.source,
        ex,
        route: input.route,
        context: input.context,
      })
    }
  } catch (e) {
    // Última red: el logger jamás debe tumbar a quien lo llama.
    console.warn('[error-log] fallo inesperado:', e instanceof Error ? e.message : e)
  }
}

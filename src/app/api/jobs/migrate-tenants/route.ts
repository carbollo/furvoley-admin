import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { migrateAllTenants } from '@/lib/portal-central/migrate-tenants'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

/**
 * Aplica el esquema Prisma actual a TODAS las BD de club.
 *
 * Se dispara a mano tras un cambio de `schema.prisma` (no es un cron): el
 * servidor Postgres solo es accesible desde la red interna de Railway, así que
 * la migración tiene que ejecutarse desde dentro del servicio.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *        https://<host>/api/jobs/migrate-tenants
 *
 * Auth: Bearer CRON_SECRET (fail-closed, igual que el resto de /api/jobs/*).
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  if (!String(process.env.TENANT_DB_BASE_URL || '').trim()) {
    return NextResponse.json(
      { error: 'Falta TENANT_DB_BASE_URL en este servicio.' },
      { status: 503 },
    )
  }

  const result = await migrateAllTenants()
  // La salida puede contener el host/BD internos: se registra en el servidor y
  // al cliente solo se le devuelve el resumen final.
  if (!result.ok) console.error('[migrate-tenants] salida:', result.output)

  const summary = result.output
    .split('\n')
    .filter((l) => l.includes('[migrate-all]'))
    .slice(-12)
    .join('\n')

  return NextResponse.json({ ok: result.ok, summary }, { status: result.ok ? 200 : 500 })
}

export async function POST(request: Request) {
  return run(request)
}

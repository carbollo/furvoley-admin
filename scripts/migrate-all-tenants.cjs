#!/usr/bin/env node
/**
 * Aplica el esquema Prisma actual a TODAS las bases de datos de tenant
 * (Modelo C · multi-tenant). Úsalo tras cada cambio de `schema.prisma`, ya que
 * en modo MT el arranque NO hace `db push` (cada BD de cliente se migra aquí o
 * al provisionar).
 *
 *   TENANT_DB_BASE_URL=... node scripts/migrate-all-tenants.cjs
 *
 * Requiere TENANT_DB_BASE_URL (servidor Postgres compartido). Enumera las BD
 * `tenant_*` y ejecuta `prisma db push` en cada una.
 */
const { spawnSync } = require('node:child_process')
const { Client } = require('pg')

const PREFIX = String(process.env.TENANT_DB_PREFIX || 'tenant_').trim() || 'tenant_'

function log(m) { process.stdout.write(`[migrate-all] ${m}\n`) }
function fail(m) { process.stderr.write(`[migrate-all] ERROR: ${m}\n`); process.exit(1) }

async function listTenantDbs(base) {
  const c = new Client({ connectionString: base })
  await c.connect()
  try {
    const r = await c.query(
      'SELECT datname FROM pg_database WHERE datname LIKE $1 ORDER BY datname',
      [`${PREFIX}%`],
    )
    return r.rows.map((x) => String(x.datname))
  } finally {
    await c.end().catch(() => {})
  }
}

function dbUrl(base, datname) {
  const u = new URL(base)
  u.pathname = `/${datname}`
  return u.toString()
}

async function main() {
  const base = String(process.env.TENANT_DB_BASE_URL || '').trim()
  if (!base) fail('Falta TENANT_DB_BASE_URL')

  const dbs = await listTenantDbs(base)
  log(`${dbs.length} BD de tenant encontradas.`)
  let ok = 0
  let ko = 0
  for (const d of dbs) {
    log(`prisma db push → ${d}`)
    const r = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['prisma', 'db', 'push', '--accept-data-loss'],
      { stdio: 'inherit', env: { ...process.env, DATABASE_URL: dbUrl(base, d) } },
    )
    if (r.status === 0) ok += 1
    else { ko += 1; process.stderr.write(`[migrate-all] Falló ${d}\n`) }
  }
  log(`Hecho: ${ok} ok, ${ko} con error.`)
  if (ko > 0) process.exit(1)
}

main().catch((e) => fail(e && e.message ? e.message : String(e)))

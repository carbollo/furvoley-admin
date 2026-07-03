#!/usr/bin/env node
/**
 * Provisiona la BD de un cliente (Modelo C · multi-tenant).
 *
 *   node scripts/provision-tenant.cjs <slug> [--admin-email x] [--admin-password y]
 *
 * Pasos:
 *   1. CREATE DATABASE tenant_<slug> en el servidor Postgres compartido
 *      (TENANT_DB_BASE_URL), si no existe.
 *   2. Sincroniza el esquema (prisma db push) en esa BD.
 *   3. Siembra el admin del cliente (bootstrap-admin con ADMIN_EMAIL/PASSWORD).
 *
 * Requiere: TENANT_DB_BASE_URL (URL del servidor compartido; su usuario debe
 * poder CREATE DATABASE). Las credenciales del admin llegan por flags o por
 * TENANT_ADMIN_EMAIL / TENANT_ADMIN_PASSWORD.
 */
const { spawnSync } = require('node:child_process')
const { Client } = require('pg')

function log(m) { process.stdout.write(`[provision] ${m}\n`) }
function fail(m) { process.stderr.write(`[provision] ERROR: ${m}\n`); process.exit(1) }

function sanitizeSlug(raw) {
  const s = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return s || null
}

function tenantDbName(slug) {
  const prefix = String(process.env.TENANT_DB_PREFIX || 'tenant_').trim() || 'tenant_'
  return `${prefix}${slug.replace(/-/g, '_')}`
}

function tenantDbUrl(slug) {
  const base = String(process.env.TENANT_DB_BASE_URL || '').trim()
  if (!base) fail('Falta TENANT_DB_BASE_URL')
  const u = new URL(base)
  u.pathname = `/${tenantDbName(slug)}`
  return u.toString()
}

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--admin-email') out.adminEmail = argv[++i]
    else if (a === '--admin-password') out.adminPassword = argv[++i]
    else out._.push(a)
  }
  return out
}

function run(cmd, args, extraEnv) {
  const bin = process.platform === 'win32' ? `${cmd}.cmd` : cmd
  const res = spawnSync(bin, args, { stdio: 'inherit', env: { ...process.env, ...extraEnv } })
  if (res.status !== 0) fail(`\`${cmd} ${args.join(' ')}\` falló (código ${res.status}).`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const slug = sanitizeSlug(args._[0] || process.env.TENANT_SLUG)
  if (!slug) fail('Uso: node scripts/provision-tenant.cjs <slug> [--admin-email x --admin-password y]')

  const base = String(process.env.TENANT_DB_BASE_URL || '').trim()
  if (!base) fail('Falta TENANT_DB_BASE_URL')

  const name = tenantDbName(slug)
  const url = tenantDbUrl(slug)

  // 1) CREATE DATABASE si no existe (conectados a la BD base del servidor).
  const admin = new Client({ connectionString: base })
  await admin.connect()
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (exists.rowCount === 0) {
      // El nombre no se puede parametrizar; va saneado (sanitizeSlug + prefijo).
      await admin.query(`CREATE DATABASE "${name}"`)
      log(`Base de datos "${name}" creada.`)
    } else {
      log(`Base de datos "${name}" ya existe (se reutiliza).`)
    }
  } finally {
    await admin.end()
  }

  // 2) Sincroniza el esquema del CRM en la BD del tenant.
  log(`Aplicando esquema en "${name}"…`)
  run('npx', ['prisma', 'db', 'push', '--skip-generate'], { DATABASE_URL: url })

  // 3) Siembra el admin del cliente.
  const adminEmail = args.adminEmail || process.env.TENANT_ADMIN_EMAIL || process.env.ADMIN_EMAIL
  const adminPassword = args.adminPassword || process.env.TENANT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD
  if (adminEmail && adminPassword) {
    log(`Sembrando admin ${adminEmail}…`)
    run('npx', ['tsx', 'prisma/bootstrap-admin.ts'], {
      DATABASE_URL: url,
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD: adminPassword,
    })
  } else {
    log('Sin credenciales de admin (--admin-email/--admin-password): se omite el seed.')
  }

  log(`✅ Cliente "${slug}" provisionado. BD: ${name}`)
}

main().catch((e) => fail(e && e.message ? e.message : String(e)))

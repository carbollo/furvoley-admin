#!/usr/bin/env node
const { spawnSync, spawn } = require('node:child_process')

process.stdout.write('[startup] Portal central mode.\n')

if (!String(process.env.NEXTAUTH_SECRET || '').trim()) {
  const fallback = String(process.env.PORTAL_SSO_SECRET || '').trim()
  if (fallback) {
    process.env.NEXTAUTH_SECRET = fallback
    process.stdout.write('[startup] NEXTAUTH_SECRET ← PORTAL_SSO_SECRET\n')
  } else {
    process.stderr.write(
      '[startup] Warning: define PORTAL_SSO_SECRET (or NEXTAUTH_SECRET) for the portal.\n',
    )
  }
}

const MAX_ATTEMPTS = Number(process.env.DB_SYNC_RETRIES || 12)
const RETRY_DELAY_MS = Number(process.env.DB_SYNC_RETRY_DELAY_MS || 5000)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * El portal (Modelo C) tiene su propia BD con las tablas Tenant/PortalUser
 * (más el resto del esquema, inerte aquí). La sincronizamos al arrancar para que
 * el panel funcione en el primer despliegue. Requiere DATABASE_URL apuntando a la
 * BD del portal; PORTAL_TENANT_MODE=true la habilita.
 */
async function ensurePortalSchema() {
  if (String(process.env.PORTAL_TENANT_MODE || '').trim().toLowerCase() !== 'true') {
    process.stdout.write('[startup] PORTAL_TENANT_MODE apagado: se omite db push.\n')
    return
  }
  if (!String(process.env.DATABASE_URL || '').trim()) {
    process.stderr.write('[startup] Falta DATABASE_URL para el portal. Exiting.\n')
    process.exit(1)
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    process.stdout.write(`[startup] Portal Prisma db push (${attempt}/${MAX_ATTEMPTS})...\n`)
    const result = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['prisma', 'db', 'push', '--skip-generate'],
      { stdio: 'inherit', env: process.env },
    )
    if (result.status === 0) {
      process.stdout.write('[startup] Portal schema synced.\n')
      return
    }
    if (attempt < MAX_ATTEMPTS) {
      process.stdout.write(`[startup] Retry in ${Math.round(RETRY_DELAY_MS / 1000)}s...\n`)
      await sleep(RETRY_DELAY_MS)
    }
  }
  process.stderr.write('[startup] Could not sync portal schema after retries. Exiting.\n')
  process.exit(1)
}

async function main() {
  await ensurePortalSchema()
  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['next', 'start'],
    { stdio: 'inherit', env: process.env },
  )
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })
}

main().catch((error) => {
  process.stderr.write(`[startup] Fatal error: ${error?.message || error}\n`)
  process.exit(1)
})

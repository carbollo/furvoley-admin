#!/usr/bin/env node
const { spawnSync, spawn } = require('node:child_process')

const MAX_ATTEMPTS = Number(process.env.DB_SYNC_RETRIES || 12)
const RETRY_DELAY_MS = Number(process.env.DB_SYNC_RETRY_DELAY_MS || 5000)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureSchema() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    process.stdout.write(
      `[startup] Prisma db push (${attempt}/${MAX_ATTEMPTS})...\n`,
    )
    const result = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['prisma', 'db', 'push'],
      { stdio: 'inherit', env: process.env },
    )
    if (result.status === 0) {
      process.stdout.write('[startup] Prisma schema synced.\n')
      return
    }
    if (attempt < MAX_ATTEMPTS) {
      process.stdout.write(
        `[startup] Retry in ${Math.round(RETRY_DELAY_MS / 1000)}s...\n`,
      )
      await sleep(RETRY_DELAY_MS)
    }
  }
  process.stderr.write(
    '[startup] Could not sync schema after retries. Exiting.\n',
  )
  process.exit(1)
}

async function main() {
  await ensureSchema()
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

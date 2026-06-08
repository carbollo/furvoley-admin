#!/usr/bin/env node
const { spawn } = require('node:child_process')

process.stdout.write('[startup] Portal central mode — skipping DB/Hermes.\n')

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

const nextStartArgs = require('./next-start-args.cjs')

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  nextStartArgs(),
  { stdio: 'inherit', env: process.env },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})

#!/usr/bin/env node
const { spawn } = require('node:child_process')

process.stdout.write('[startup] Portal central mode — skipping DB/Hermes.\n')

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

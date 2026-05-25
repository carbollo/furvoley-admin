import { spawn, type ChildProcess } from 'node:child_process'
import { access, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { writeHermesConfigFiles } from '@/lib/hermes-gateway/config-writer'
import { getHermesHome, getHermesSettings } from '@/lib/hermes-gateway/settings'

export type GatewayStatus = 'running' | 'stopped' | 'error'

declare global {
  // eslint-disable-next-line no-var
  var __hermesGatewayChild: ChildProcess | null | undefined
}

let gatewayChild: ChildProcess | null = globalThis.__hermesGatewayChild ?? null
globalThis.__hermesGatewayChild = gatewayChild

function pidFile() {
  return path.join(getHermesHome(), 'gateway.pid')
}

async function readPidFile(): Promise<number | null> {
  try {
    const raw = (await readFile(pidFile(), 'utf8')).trim()
    const pid = Number(raw)
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

async function writePidFile(pid: number) {
  await writeFile(pidFile(), String(pid), 'utf8')
}

async function clearPidFile() {
  try {
    await unlink(pidFile())
  } catch {
    //
  }
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function stopGatewayProcess() {
  if (gatewayChild?.pid) {
    try {
      gatewayChild.kill('SIGTERM')
    } catch {
      //
    }
    gatewayChild = null
    globalThis.__hermesGatewayChild = null
  }

  const pid = await readPidFile()
  if (pid && isProcessAlive(pid)) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      //
    }
  }
  await clearPidFile()
}

export async function startGateway(): Promise<{ ok: boolean; error?: string }> {
  const settings = await getHermesSettings()
  if (!settings.enabled) {
    return { ok: false, error: 'Hermes desactivado en el CRM' }
  }
  if (!settings.ollamaApiKey) {
    return { ok: false, error: 'Falta la API key de Ollama Cloud en el CRM' }
  }

  await writeHermesConfigFiles()

  const existingPid = await readPidFile()
  if (existingPid && isProcessAlive(existingPid)) {
    return { ok: true }
  }

  const home = getHermesHome()
  await access(home).catch(async () => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(home, { recursive: true })
  })

  return new Promise((resolve) => {
    const child = spawn('hermes', ['gateway'], {
      env: { ...process.env, HERMES_HOME: home },
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    gatewayChild = child
    globalThis.__hermesGatewayChild = child

    child.stdout?.on('data', (chunk) => {
      process.stdout.write(`[hermes-gateway] ${chunk}`)
    })
    child.stderr?.on('data', (chunk) => {
      process.stderr.write(`[hermes-gateway] ${chunk}`)
    })

    child.on('error', (err) => {
      gatewayChild = null
      globalThis.__hermesGatewayChild = null
      void clearPidFile()
      resolve({ ok: false, error: err.message })
    })

    child.on('exit', (code, signal) => {
      if (gatewayChild === child) {
        gatewayChild = null
        globalThis.__hermesGatewayChild = null
      }
      void clearPidFile()
      if (code && code !== 0) {
        resolve({ ok: false, error: `Gateway salió con código ${code}${signal ? ` (${signal})` : ''}` })
      }
    })

    if (child.pid) {
      void writePidFile(child.pid)
      resolve({ ok: true })
    } else {
      resolve({ ok: false, error: 'No se pudo arrancar hermes gateway' })
    }
  })
}

export async function restartGateway() {
  await stopGatewayProcess()
  return startGateway()
}

export async function getGatewayStatus(): Promise<{
  status: GatewayStatus
  pid: number | null
  message?: string
}> {
  const pidFromFile = await readPidFile()
  const pid = gatewayChild?.pid || pidFromFile
  if (pid && isProcessAlive(pid)) {
    return { status: 'running', pid }
  }
  if (gatewayChild && !gatewayChild.killed) {
    return { status: 'running', pid: gatewayChild.pid ?? null }
  }
  return { status: 'stopped', pid: null }
}

export async function stopGateway() {
  await stopGatewayProcess()
  return { ok: true }
}

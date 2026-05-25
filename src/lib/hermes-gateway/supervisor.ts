import { spawn, type ChildProcess } from 'node:child_process'
import { access, appendFile, mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { writeHermesConfigFiles } from '@/lib/hermes-gateway/config-writer'
import { getHermesHome, getHermesSettings } from '@/lib/hermes-gateway/settings'
import {
  isWhatsappPaired,
  startWhatsappPairingIfNeeded,
  stopWhatsappPairing,
} from '@/lib/hermes-gateway/whatsapp-pairing'

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

function gatewayLogFile() {
  return path.join(getHermesHome(), 'gateway.log')
}

function gatewayErrorFile() {
  return path.join(getHermesHome(), 'gateway.last-error')
}

function getHermesBin() {
  return String(process.env.HERMES_BIN || 'hermes').trim() || 'hermes'
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

async function writeGatewayError(message: string) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  await appendFile(gatewayErrorFile(), line, 'utf8').catch(async () => {
    await writeFile(gatewayErrorFile(), line, 'utf8')
  })
}

async function readGatewayError(): Promise<string | undefined> {
  try {
    const raw = (await readFile(gatewayErrorFile(), 'utf8')).trim()
    if (!raw) return undefined
    const lines = raw.split('\n')
    return lines[lines.length - 1]?.replace(/^\[[^\]]+\]\s*/, '') || undefined
  } catch {
    return undefined
  }
}

async function readGatewayLogTail(maxLines = 8): Promise<string | undefined> {
  try {
    const raw = (await readFile(gatewayLogFile(), 'utf8')).trim()
    if (!raw) return undefined
    return raw.split('\n').slice(-maxLines).join('\n')
  } catch {
    return undefined
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
      process.kill(gatewayChild.pid, 'SIGTERM')
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
      await sleep(400)
      if (isProcessAlive(pid)) {
        process.kill(pid, 'SIGKILL')
      }
    } catch {
      //
    }
  }
  await clearPidFile()
}

async function spawnGatewayProcess(): Promise<{ ok: boolean; error?: string; pid?: number }> {
  const home = getHermesHome()
  await mkdir(home, { recursive: true })

  const logPath = gatewayLogFile()
  await appendFile(logPath, `\n--- gateway start ${new Date().toISOString()} ---\n`, 'utf8').catch(
    async () => {
      await writeFile(logPath, `--- gateway start ${new Date().toISOString()} ---\n`, 'utf8')
    },
  )

  const logHandle = await open(logPath, 'a')

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: { ok: boolean; error?: string; pid?: number }) => {
      if (settled) return
      settled = true
      void logHandle.close().catch(() => undefined)
      resolve(result)
    }

    const child = spawn(getHermesBin(), ['gateway'], {
      env: { ...process.env, HERMES_HOME: home },
      detached: true,
      stdio: ['ignore', logHandle.fd, logHandle.fd],
    })

    child.on('error', (err) => {
      void writeGatewayError(err.message)
      finish({ ok: false, error: err.message })
    })

    child.on('exit', (code, signal) => {
      if (code && code !== 0) {
        const msg = `Gateway salió con código ${code}${signal ? ` (${signal})` : ''}`
        void writeGatewayError(msg)
      }
    })

    if (!child.pid) {
      finish({ ok: false, error: 'No se pudo arrancar hermes gateway' })
      return
    }

    gatewayChild = child
    globalThis.__hermesGatewayChild = child
    void writePidFile(child.pid)
    child.unref()
    finish({ ok: true, pid: child.pid })
  })
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
    if (!(await isWhatsappPaired())) {
      await startWhatsappPairingIfNeeded()
    } else {
      await stopWhatsappPairing()
    }
    return { ok: true }
  }

  await access(getHermesHome()).catch(async () => {
    await mkdir(getHermesHome(), { recursive: true })
  })

  const spawned = await spawnGatewayProcess()
  if (!spawned.ok || !spawned.pid) {
    const logTail = await readGatewayLogTail()
    return {
      ok: false,
      error: spawned.error || logTail || 'No se pudo arrancar hermes gateway',
    }
  }

  await sleep(800)
  if (!isProcessAlive(spawned.pid)) {
    const logTail = await readGatewayLogTail()
    const lastError = (await readGatewayError()) || logTail
    await clearPidFile()
    return {
      ok: false,
      error: lastError || 'Hermes gateway se detuvo al arrancar. Revisa gateway.log en el volumen.',
    }
  }

  if (!(await isWhatsappPaired())) {
    const pair = await startWhatsappPairingIfNeeded()
    if (!pair.ok) {
      return { ok: false, error: pair.error || 'No se pudo iniciar emparejamiento WhatsApp' }
    }
  } else {
    await stopWhatsappPairing()
  }

  return { ok: true }
}

export async function ensureGatewayRunning(): Promise<{ ok: boolean; error?: string }> {
  const settings = await getHermesSettings()
  if (!settings.enabled) return { ok: true }

  const status = await getGatewayStatus()
  if (status.status === 'running') return { ok: true }

  return startGateway()
}

export async function restartGateway() {
  await stopGatewayProcess()
  await stopWhatsappPairing()
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

  const lastError = await readGatewayError()
  if (lastError) {
    return { status: 'error', pid: null, message: lastError }
  }

  return { status: 'stopped', pid: null }
}

export async function stopGateway() {
  await stopGatewayProcess()
  return { ok: true }
}

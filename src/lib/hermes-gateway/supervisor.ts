import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { access, appendFile, mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { writeHermesConfigFiles } from '@/lib/hermes-gateway/config-writer'
import {
  clearHermesGatewayPidFile,
  readHermesGatewayPid,
} from '@/lib/hermes-gateway/gateway-pid'
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

async function clearGatewayError() {
  try {
    await unlink(gatewayErrorFile())
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

export async function readGatewayLogTail(maxLines = 8): Promise<string | undefined> {
  try {
    const raw = (await readFile(gatewayLogFile(), 'utf8')).trim()
    if (!raw) return undefined
    return raw.split('\n').slice(-maxLines).join('\n')
  } catch {
    return undefined
  }
}

async function loadHermesDotenv(home: string): Promise<Record<string, string>> {
  const env: Record<string, string> = {}
  try {
    const raw = await readFile(path.join(home, '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
  } catch {
    //
  }
  return env
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killProcessTree(pid: number) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    //
  }
  spawnSync('kill', ['-TERM', `-${pid}`], { stdio: 'ignore' })
}

function killHermesGatewayByPattern() {
  if (process.platform === 'win32') return
  spawnSync('pkill', ['-TERM', '-f', 'hermes_cli.main gateway'], { stdio: 'ignore' })
  spawnSync('pkill', ['-TERM', '-f', 'hermes gateway run'], { stdio: 'ignore' })
}

async function waitForGatewayProcessExit(pid: number | null, maxMs = 4000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    if (!pid || !isProcessAlive(pid)) return true
    await sleep(200)
  }
  if (pid && isProcessAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      //
    }
    if (process.platform !== 'win32') {
      spawnSync('pkill', ['-KILL', '-f', 'hermes_cli.main gateway'], { stdio: 'ignore' })
    }
    await sleep(300)
  }
  return !pid || !isProcessAlive(pid)
}

async function stopHermesGatewayProcesses() {
  if (gatewayChild?.pid) {
    killProcessTree(gatewayChild.pid)
    gatewayChild = null
    globalThis.__hermesGatewayChild = null
  }

  const pid = await readHermesGatewayPid()
  if (pid) {
    killProcessTree(pid)
    await waitForGatewayProcessExit(pid)
  } else {
    killHermesGatewayByPattern()
    await sleep(400)
  }

  await clearHermesGatewayPidFile()
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

  const hermesEnv = await loadHermesDotenv(home)
  const logHandle = await open(logPath, 'a')

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: { ok: boolean; error?: string; pid?: number }) => {
      if (settled) return
      settled = true
      void logHandle.close().catch(() => undefined)
      resolve(result)
    }

    const child = spawn(getHermesBin(), ['gateway', 'run', '--replace'], {
      env: { ...process.env, ...hermesEnv, HERMES_HOME: home },
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
      if (gatewayChild === child) {
        gatewayChild = null
        globalThis.__hermesGatewayChild = null
      }
    })

    if (!child.pid) {
      finish({ ok: false, error: 'No se pudo arrancar hermes gateway' })
      return
    }

    gatewayChild = child
    globalThis.__hermesGatewayChild = child
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

  const existingPid = await readHermesGatewayPid()
  if (existingPid && isProcessAlive(existingPid)) {
    if (!(await isWhatsappPaired())) {
      await startWhatsappPairingIfNeeded()
    } else {
      await stopWhatsappPairing()
    }
    await clearGatewayError()
    return { ok: true }
  }

  await access(getHermesHome()).catch(async () => {
    await mkdir(getHermesHome(), { recursive: true })
  })

  await stopHermesGatewayProcesses()

  const spawned = await spawnGatewayProcess()
  if (!spawned.ok || !spawned.pid) {
    const logTail = await readGatewayLogTail(20)
    return {
      ok: false,
      error: spawned.error || logTail || 'No se pudo arrancar hermes gateway',
    }
  }

  await sleep(1500)

  const hermesPid = (await readHermesGatewayPid()) || spawned.pid
  const alivePid = hermesPid && isProcessAlive(hermesPid) ? hermesPid : spawned.pid
  if (!isProcessAlive(alivePid)) {
    const logTail = await readGatewayLogTail(24)
    const lastError = (await readGatewayError()) || logTail
    await clearHermesGatewayPidFile()
    return {
      ok: false,
      error:
        lastError ||
        'Hermes gateway se detuvo al arrancar. Si ves "runtime lock", pulsa Reiniciar gateway de nuevo.',
    }
  }

  await clearGatewayError()

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
  await stopHermesGatewayProcesses()
  await stopWhatsappPairing()
  await sleep(300)
  return startGateway()
}

export async function getGatewayStatus(): Promise<{
  status: GatewayStatus
  pid: number | null
  message?: string
  logTail?: string
}> {
  const hermesPid = await readHermesGatewayPid()
  const pid = hermesPid || gatewayChild?.pid || null
  if (pid && isProcessAlive(pid)) {
    return { status: 'running', pid }
  }

  const lastError = await readGatewayError()
  const logTail = await readGatewayLogTail(20)
  if (lastError) {
    return {
      status: 'error',
      pid: null,
      message: lastError,
      logTail,
    }
  }

  return { status: 'stopped', pid: null, logTail }
}

export async function stopGateway() {
  await stopHermesGatewayProcesses()
  return { ok: true }
}

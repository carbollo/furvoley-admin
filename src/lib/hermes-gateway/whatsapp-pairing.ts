import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { access, mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { getHermesHome, getHermesSettings } from '@/lib/hermes-gateway/settings'

declare global {
  // eslint-disable-next-line no-var
  var __hermesWhatsappPairChild: ChildProcess | null | undefined
}

let pairChild: ChildProcess | null = globalThis.__hermesWhatsappPairChild ?? null
globalThis.__hermesWhatsappPairChild = pairChild

function pairPidFile() {
  return path.join(getHermesHome(), 'whatsapp', 'pair.pid')
}

function pairLogFile() {
  return path.join(getHermesHome(), 'whatsapp', 'pair.log')
}

export function whatsappSessionDir() {
  return path.join(getHermesHome(), 'platforms', 'whatsapp', 'session')
}

export function whatsappCredsPath() {
  return path.join(whatsappSessionDir(), 'creds.json')
}

async function pathExists(p: string) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function readPidFile(file: string): Promise<number | null> {
  try {
    const pid = Number((await readFile(file, 'utf8')).trim())
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    return null
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

export function resolveHermesBridgeScript(): string | null {
  const fromEnv = String(process.env.HERMES_BRIDGE_SCRIPT || '').trim()
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const bundled = '/opt/hermes-whatsapp-bridge/bridge.js'
  if (existsSync(bundled)) return bundled

  const legacy = spawnSync(
    'python3',
    [
      '-c',
      "from pathlib import Path; import site; p=Path(site.getsitepackages()[0])/'scripts/whatsapp-bridge/bridge.js'; print(p if p.exists() else '')",
    ],
    { encoding: 'utf8' },
  )
  const legacyScript = String(legacy.stdout || '').trim()
  return legacyScript && existsSync(legacyScript) ? legacyScript : null
}

async function stopPairingProcess() {
  if (pairChild?.pid) {
    try {
      process.kill(pairChild.pid, 'SIGTERM')
    } catch {
      //
    }
    pairChild = null
    globalThis.__hermesWhatsappPairChild = null
  }

  const pid = await readPidFile(pairPidFile())
  if (pid && isProcessAlive(pid)) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      //
    }
  }
  try {
    await unlink(pairPidFile())
  } catch {
    //
  }
}

export async function isWhatsappPaired() {
  return pathExists(whatsappCredsPath())
}

export async function isWhatsappPairingActive() {
  const pid = pairChild?.pid || (await readPidFile(pairPidFile()))
  return Boolean(pid && isProcessAlive(pid))
}

export async function startWhatsappPairingIfNeeded(): Promise<{ ok: boolean; error?: string; started?: boolean }> {
  if (await isWhatsappPaired()) {
    await stopPairingProcess()
    return { ok: true, started: false }
  }

  if (await isWhatsappPairingActive()) {
    return { ok: true, started: false }
  }

  const settings = await getHermesSettings()
  if (!settings.enabled) {
    return { ok: false, error: 'Hermes desactivado' }
  }

  const bridgeScript = resolveHermesBridgeScript()
  if (!bridgeScript) {
    return { ok: false, error: 'No se encontró bridge.js de Hermes WhatsApp' }
  }

  const bridgeDir = path.dirname(bridgeScript)
  const nodeModules = path.join(bridgeDir, 'node_modules')
  if (!(await pathExists(nodeModules))) {
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const install = spawnSync(npmBin, ['install', '--silent'], {
      cwd: bridgeDir,
      encoding: 'utf8',
      timeout: 300_000,
    })
    if (install.status !== 0) {
      return { ok: false, error: 'No se pudieron instalar dependencias del bridge WhatsApp' }
    }
  }

  const home = getHermesHome()
  await mkdir(whatsappSessionDir(), { recursive: true })
  await mkdir(path.join(home, 'whatsapp'), { recursive: true })

  const logPath = pairLogFile()
  const logHandle = await open(logPath, 'a')

  const allowedUsers = settings.allowedUsers.join(',')
  const child = spawn(
    process.execPath,
    [bridgeScript, '--pair-only', '--session', whatsappSessionDir(), '--mode', settings.whatsappMode],
    {
      env: {
        ...process.env,
        HERMES_HOME: home,
        WHATSAPP_MODE: settings.whatsappMode,
        WHATSAPP_ALLOWED_USERS: allowedUsers,
      },
      detached: true,
      stdio: ['ignore', logHandle.fd, logHandle.fd],
    },
  )

  await logHandle.close().catch(() => undefined)

  if (!child.pid) {
    return { ok: false, error: 'No se pudo arrancar el emparejamiento WhatsApp' }
  }

  pairChild = child
  globalThis.__hermesWhatsappPairChild = child
  await writeFile(pairPidFile(), String(child.pid), 'utf8')
  child.unref()

  child.on('exit', () => {
    if (pairChild === child) {
      pairChild = null
      globalThis.__hermesWhatsappPairChild = null
    }
    void unlink(pairPidFile()).catch(() => undefined)
    void (async () => {
      if (await isWhatsappPaired()) {
        const { restartGateway } = await import('@/lib/hermes-gateway/supervisor')
        await restartGateway()
      }
    })()
  })

  return { ok: true, started: true }
}

export async function stopWhatsappPairing() {
  await stopPairingProcess()
  return { ok: true }
}

export async function clearWhatsappPairingArtifacts() {
  const home = getHermesHome()
  await stopPairingProcess()
  await Promise.all([
    unlink(path.join(home, 'whatsapp', 'latest_qr.txt')).catch(() => undefined),
    unlink(whatsappCredsPath()).catch(() => undefined),
  ])
}

import { readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { getHermesHome } from '@/lib/hermes-gateway/settings'

export function hermesGatewayPidFile() {
  return path.join(getHermesHome(), 'gateway.pid')
}

export function hermesGatewayLockFile() {
  return path.join(getHermesHome(), 'gateway.lock')
}

/** Hermes writes gateway.pid as JSON; legacy/plain numeric files are also supported. */
export async function readHermesGatewayPid(): Promise<number | null> {
  try {
    const raw = (await readFile(hermesGatewayPidFile(), 'utf8')).trim()
    if (!raw) return null
    if (raw.startsWith('{')) {
      const record = JSON.parse(raw) as { pid?: number | string }
      const pid = Number(record.pid)
      return Number.isFinite(pid) && pid > 0 ? pid : null
    }
    const pid = Number(raw)
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

export async function clearHermesGatewayPidFile() {
  try {
    await unlink(hermesGatewayPidFile())
  } catch {
    //
  }
}

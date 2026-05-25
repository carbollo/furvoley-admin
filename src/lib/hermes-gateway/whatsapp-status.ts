import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import {
  getHermesHome,
  getHermesWhatsappBridgePort,
} from '@/lib/hermes-gateway/settings'
import {
  isWhatsappPaired,
  isWhatsappPairingActive,
  whatsappCredsPath,
} from '@/lib/hermes-gateway/whatsapp-pairing'

export type HermesWhatsappStatus =
  | 'CONNECTED'
  | 'SESSION_PAIRED'
  | 'QR_PENDING'
  | 'DISCONNECTED'
  | 'PAIRING'

async function pathExists(p: string) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

export async function probeWhatsappBridgeHealth(): Promise<{
  healthy: boolean
  connectionState: string | null
  bridgePort: number
}> {
  const bridgePort = getHermesWhatsappBridgePort()
  try {
    const res = await fetch(`http://127.0.0.1:${bridgePort}/health`, {
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) {
      return { healthy: false, connectionState: null, bridgePort }
    }
    const data = (await res.json()) as { status?: string }
    const connectionState = String(data?.status || '').trim() || null
    return {
      healthy: connectionState === 'connected',
      connectionState,
      bridgePort,
    }
  } catch {
    return { healthy: false, connectionState: null, bridgePort }
  }
}

export async function getHermesWhatsappStatus(): Promise<{
  status: HermesWhatsappStatus
  hasSession: boolean
  hasQr: boolean
  pairingActive: boolean
  bridgeHealthy: boolean
  bridgeConnectionState: string | null
  bridgePort: number
}> {
  const home = getHermesHome()
  const bridgePort = getHermesWhatsappBridgePort()
  const paired = await isWhatsappPaired()

  if (paired) {
    const bridge = await probeWhatsappBridgeHealth()
    return {
      status: bridge.healthy ? 'CONNECTED' : 'SESSION_PAIRED',
      hasSession: true,
      hasQr: false,
      pairingActive: false,
      bridgeHealthy: bridge.healthy,
      bridgeConnectionState: bridge.connectionState,
      bridgePort,
    }
  }

  const qrPath = path.join(home, 'whatsapp', 'latest_qr.txt')
  const hasQr = await pathExists(qrPath)
  const pairingActive = await isWhatsappPairingActive()

  if (hasQr) {
    return {
      status: 'QR_PENDING',
      hasSession: false,
      hasQr: true,
      pairingActive,
      bridgeHealthy: false,
      bridgeConnectionState: null,
      bridgePort,
    }
  }

  if (pairingActive) {
    return {
      status: 'PAIRING',
      hasSession: false,
      hasQr: false,
      pairingActive: true,
      bridgeHealthy: false,
      bridgeConnectionState: null,
      bridgePort,
    }
  }

  return {
    status: 'DISCONNECTED',
    hasSession: false,
    hasQr: false,
    pairingActive: false,
    bridgeHealthy: false,
    bridgeConnectionState: null,
    bridgePort,
  }
}

export async function readHermesWhatsappQrPayload(): Promise<string | null> {
  const home = getHermesHome()
  const qrPath = path.join(home, 'whatsapp', 'latest_qr.txt')
  if (!(await pathExists(qrPath))) return null
  try {
    const raw = (await readFile(qrPath, 'utf8')).trim()
    return raw || null
  } catch {
    return null
  }
}

export async function readHermesGatewayLogTail(maxLines = 40): Promise<string[]> {
  const home = getHermesHome()
  const logPath = path.join(home, 'gateway.log')
  if (!(await pathExists(logPath))) return []
  try {
    const raw = await readFile(logPath, 'utf8')
    return raw.split(/\r?\n/).filter(Boolean).slice(-maxLines)
  } catch {
    return []
  }
}

export async function readHermesWhatsappBridgeLogTail(maxLines = 30): Promise<string[]> {
  const logPath = path.join(getHermesHome(), 'platforms', 'whatsapp', 'bridge.log')
  if (!(await pathExists(logPath))) return []
  try {
    const raw = await readFile(logPath, 'utf8')
    return raw.split(/\r?\n/).filter(Boolean).slice(-maxLines)
  } catch {
    return []
  }
}

export async function readHermesWhatsappPairLogTail(maxLines = 20): Promise<string[]> {
  const home = getHermesHome()
  const logPath = path.join(home, 'whatsapp', 'pair.log')
  if (!(await pathExists(logPath))) return []
  try {
    const raw = await readFile(logPath, 'utf8')
    return raw.split(/\r?\n/).filter(Boolean).slice(-maxLines)
  } catch {
    return []
  }
}

/** @deprecated use isWhatsappPaired() */
export async function hasWhatsappSessionFiles() {
  const sessionDir = path.dirname(whatsappCredsPath())
  if (!(await pathExists(sessionDir))) return false
  try {
    const entries = await readdir(sessionDir)
    return entries.some((e) => !e.startsWith('.'))
  } catch {
    return false
  }
}

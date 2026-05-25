import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { getHermesHome } from '@/lib/hermes-gateway/settings'
import {
  isWhatsappPaired,
  isWhatsappPairingActive,
  whatsappCredsPath,
} from '@/lib/hermes-gateway/whatsapp-pairing'

export type HermesWhatsappStatus = 'CONNECTED' | 'QR_PENDING' | 'DISCONNECTED' | 'PAIRING'

async function pathExists(p: string) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

export async function getHermesWhatsappStatus(): Promise<{
  status: HermesWhatsappStatus
  hasSession: boolean
  hasQr: boolean
  pairingActive: boolean
}> {
  const home = getHermesHome()
  const paired = await isWhatsappPaired()
  if (paired) {
    return { status: 'CONNECTED', hasSession: true, hasQr: false, pairingActive: false }
  }

  const qrPath = path.join(home, 'whatsapp', 'latest_qr.txt')
  const hasQr = await pathExists(qrPath)
  const pairingActive = await isWhatsappPairingActive()

  if (hasQr) {
    return { status: 'QR_PENDING', hasSession: false, hasQr: true, pairingActive }
  }

  if (pairingActive) {
    return { status: 'PAIRING', hasSession: false, hasQr: false, pairingActive: true }
  }

  return { status: 'DISCONNECTED', hasSession: false, hasQr: false, pairingActive: false }
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

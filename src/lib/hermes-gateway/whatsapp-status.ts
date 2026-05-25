import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { getHermesHome } from '@/lib/hermes-gateway/settings'

export type HermesWhatsappStatus = 'CONNECTED' | 'QR_PENDING' | 'DISCONNECTED'

async function pathExists(p: string) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function hasWhatsappSession(home: string) {
  const sessionDir = path.join(home, 'platforms', 'whatsapp', 'session')
  if (!(await pathExists(sessionDir))) return false
  try {
    const entries = await readdir(sessionDir)
    return entries.some((e) => !e.startsWith('.'))
  } catch {
    return false
  }
}

export async function getHermesWhatsappStatus(): Promise<{
  status: HermesWhatsappStatus
  hasSession: boolean
  hasQr: boolean
}> {
  const home = getHermesHome()
  const hasSession = await hasWhatsappSession(home)
  if (hasSession) {
    return { status: 'CONNECTED', hasSession: true, hasQr: false }
  }

  const qrPath = path.join(home, 'whatsapp', 'latest_qr.txt')
  const hasQr = await pathExists(qrPath)
  if (hasQr) {
    return { status: 'QR_PENDING', hasSession: false, hasQr: true }
  }

  return { status: 'DISCONNECTED', hasSession: false, hasQr: false }
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
  const logPath = path.join(home, 'logs', 'gateway.log')
  if (!(await pathExists(logPath))) return []
  try {
    const raw = await readFile(logPath, 'utf8')
    return raw.split(/\r?\n/).filter(Boolean).slice(-maxLines)
  } catch {
    return []
  }
}

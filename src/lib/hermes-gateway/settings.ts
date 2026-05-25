import { prisma } from '@/lib/prisma'

export type HermesWhatsappMode = 'bot' | 'self-chat'

export type HermesSettingsRow = {
  hermesEnabled: boolean
  hermesMcpApiKey: string | null
  hermesApiServerKey: string | null
  hermesOllamaApiKey: string | null
  hermesOllamaModel: string | null
  hermesWhatsappMode: string | null
  hermesAllowedUsers: unknown
  hermesAllowDestructive: boolean
}

export type HermesSettings = {
  enabled: boolean
  mcpApiKey: string | null
  apiServerKey: string | null
  ollamaApiKey: string | null
  ollamaModel: string
  whatsappMode: HermesWhatsappMode
  allowedUsers: string[]
  allowDestructive: boolean
}

const HERMES_SELECT = {
  hermesEnabled: true,
  hermesMcpApiKey: true,
  hermesApiServerKey: true,
  hermesOllamaApiKey: true,
  hermesOllamaModel: true,
  hermesWhatsappMode: true,
  hermesAllowedUsers: true,
  hermesAllowDestructive: true,
} as const

export function normalizeAllowedUsers(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((p) => String(p || '').replace(/[^\d]/g, ''))
      .filter(Boolean)
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[,;\s]+/)
      .map((p) => p.replace(/[^\d]/g, ''))
      .filter(Boolean)
  }
  return []
}

export function normalizeWhatsappMode(raw: string | null | undefined): HermesWhatsappMode {
  return String(raw || '').trim().toLowerCase() === 'self-chat' ? 'self-chat' : 'bot'
}

export function mapHermesSettings(row: HermesSettingsRow | null): HermesSettings {
  return {
    enabled: row?.hermesEnabled ?? false,
    mcpApiKey: row?.hermesMcpApiKey?.trim() || null,
    apiServerKey: row?.hermesApiServerKey?.trim() || null,
    ollamaApiKey: row?.hermesOllamaApiKey?.trim() || null,
    ollamaModel: row?.hermesOllamaModel?.trim() || 'gpt-oss:120b',
    whatsappMode: normalizeWhatsappMode(row?.hermesWhatsappMode),
    allowedUsers: normalizeAllowedUsers(row?.hermesAllowedUsers),
    allowDestructive: row?.hermesAllowDestructive ?? false,
  }
}

export async function fetchHermesSettingsRow() {
  return prisma.clubSettings.findFirst({
    where: { isDefault: true },
    select: HERMES_SELECT,
  })
}

export async function getHermesSettings(): Promise<HermesSettings> {
  const row = await fetchHermesSettingsRow()
  return mapHermesSettings(row)
}

export function envBool(name: string) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true'
}

export function maskSecret(value: string | null | undefined) {
  const v = String(value || '').trim()
  if (!v) return ''
  if (v.length <= 8) return '••••••••'
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}

export function getHermesHome() {
  return String(process.env.HERMES_HOME || '').trim() || `${process.env.HOME || '/root'}/.hermes`
}

/** WhatsApp bridge HTTP port — must not collide with Next.js (PORT, default 3000). */
export function getHermesWhatsappBridgePort() {
  const raw = String(process.env.HERMES_WHATSAPP_BRIDGE_PORT || '3001').trim()
  const port = Number(raw)
  return Number.isFinite(port) && port > 0 && port < 65536 ? port : 3001
}

/** Hermes API Server port (OpenAI-compatible chat). Default 8642. */
export function getHermesApiServerPort() {
  const raw = String(process.env.HERMES_API_SERVER_PORT || '8642').trim()
  const port = Number(raw)
  return Number.isFinite(port) && port > 0 && port < 65536 ? port : 8642
}

export function resolveHermesMcpUrlFromEnv() {
  return String(process.env.FURVOLEY_MCP_URL || '').trim() || null
}

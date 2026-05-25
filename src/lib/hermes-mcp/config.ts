import { prisma } from '@/lib/prisma'
import {
  envBool,
  getHermesSettings,
  maskSecret,
  normalizeAllowedUsers,
  resolveHermesMcpUrlFromEnv,
} from '@/lib/hermes-gateway/settings'

export { maskSecret as maskApiKey, getHermesHome } from '@/lib/hermes-gateway/settings'
export { getHermesSettings } from '@/lib/hermes-gateway/settings'

export function resolveHermesMcpUrl(request?: Request) {
  const fromEnv = resolveHermesMcpUrlFromEnv()
  if (fromEnv) return fromEnv
  const appUrl =
    String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').trim() ||
    (request ? new URL(request.url).origin : '')
  if (!appUrl) return '/api/hermes/mcp'
  return `${appUrl.replace(/\/+$/, '')}/api/hermes/mcp`
}

export async function isHermesEnabled() {
  if (envBool('HERMES_ENABLED')) return true
  const settings = await getHermesSettings()
  return settings.enabled
}

export async function isHermesDestructiveAllowed() {
  if (envBool('HERMES_ALLOW_DESTRUCTIVE')) return true
  const settings = await getHermesSettings()
  return settings.allowDestructive
}

export async function getHermesAllowedUsers(): Promise<string[]> {
  const fromEnv = String(process.env.WHATSAPP_ALLOWED_USERS || '').trim()
  if (fromEnv) return normalizeAllowedUsers(fromEnv)
  const settings = await getHermesSettings()
  return settings.allowedUsers
}

export async function getHermesMcpApiKey(): Promise<string | null> {
  const fromEnv = String(process.env.HERMES_MCP_API_KEY || '').trim()
  if (fromEnv) return fromEnv
  const settings = await getHermesSettings()
  return settings.mcpApiKey
}

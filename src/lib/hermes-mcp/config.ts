import { prisma } from '@/lib/prisma'

export function isHermesEnabled() {
  return String(process.env.HERMES_ENABLED || '').trim().toLowerCase() === 'true'
}

export function isHermesDestructiveAllowed() {
  return String(process.env.HERMES_ALLOW_DESTRUCTIVE || '').trim().toLowerCase() === 'true'
}

export function getHermesAllowedUsers(): string[] {
  const raw = String(process.env.WHATSAPP_ALLOWED_USERS || '').trim()
  if (!raw) return []
  return raw
    .split(/[,;\s]+/)
    .map((p) => p.replace(/[^\d]/g, ''))
    .filter(Boolean)
}

export async function getHermesMcpApiKey(): Promise<string | null> {
  const fromEnv = String(process.env.HERMES_MCP_API_KEY || '').trim()
  if (fromEnv) return fromEnv

  const row = await prisma.clubSettings.findFirst({
    where: { isDefault: true },
    select: { hermesMcpApiKey: true },
  })
  const fromDb = row?.hermesMcpApiKey?.trim()
  return fromDb || null
}

export function maskApiKey(key: string | null | undefined) {
  const v = String(key || '').trim()
  if (!v) return ''
  if (v.length <= 8) return '••••••••'
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}

export function resolveHermesMcpUrl(request?: Request) {
  const fromEnv = String(process.env.FURVOLEY_MCP_URL || '').trim()
  if (fromEnv) return fromEnv

  const appUrl =
    String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '').trim() ||
    (request ? new URL(request.url).origin : '')
  if (!appUrl) return '/api/hermes/mcp'
  return `${appUrl.replace(/\/+$/, '')}/api/hermes/mcp`
}

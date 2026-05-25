import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import {
  getHermesAllowedUsers,
  getHermesMcpApiKey,
  isHermesDestructiveAllowed,
  isHermesEnabled,
  maskApiKey,
  resolveHermesMcpUrl,
} from '@/lib/hermes-mcp/config'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const apiKey = await getHermesMcpApiKey()
  return NextResponse.json({
    ok: true,
    enabled: isHermesEnabled(),
    mcpUrl: resolveHermesMcpUrl(request),
    hasApiKey: Boolean(apiKey),
    apiKeyMasked: maskApiKey(apiKey),
    destructiveAllowed: isHermesDestructiveAllowed(),
    allowedUsers: getHermesAllowedUsers(),
    toolCount: 26,
  })
}

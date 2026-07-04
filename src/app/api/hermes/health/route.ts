import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getGatewayStatus } from '@/lib/hermes-gateway/supervisor'
import { getHermesWhatsappStatus } from '@/lib/hermes-gateway/whatsapp-status'
import {
  getHermesMcpApiKey,
  isHermesDestructiveAllowed,
  isHermesEnabled,
  resolveHermesMcpUrl,
} from '@/lib/hermes-mcp/config'
import { getHermesSettings, maskSecret, resolveActiveLlm } from '@/lib/hermes-gateway/settings'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const settings = await getHermesSettings()
  const apiKey = await getHermesMcpApiKey()
  const [gateway, whatsapp] = await Promise.all([getGatewayStatus(), getHermesWhatsappStatus()])

  return NextResponse.json({
    ok: true,
    enabled: await isHermesEnabled(),
    mcpUrl: resolveHermesMcpUrl(request),
    hasApiKey: Boolean(apiKey),
    apiKeyMasked: maskSecret(apiKey),
    destructiveAllowed: await isHermesDestructiveAllowed(),
    ollamaModel: settings.ollamaModel,
    hasOllamaKey: Boolean(settings.ollamaApiKey),
    deepseekModel: settings.deepseekModel,
    hasDeepseekKey: Boolean(settings.deepseekApiKey),
    modelProvider: settings.modelProvider,
    hasActiveLlmKey: Boolean(resolveActiveLlm(settings).apiKey),
    allowedUsers: settings.allowedUsers,
    gateway,
    whatsapp,
  })
}

import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { writeHermesConfigFiles } from '@/lib/hermes-gateway/config-writer'
import {
  getHermesSettings,
  maskSecret,
  normalizeAllowedUsers,
  normalizeModelProvider,
  normalizeWhatsappMode,
  activeLlmMissingKeyMessage,
  resolveActiveLlm,
} from '@/lib/hermes-gateway/settings'
import { getGatewayStatus, scheduleGatewayRestart, stopGateway } from '@/lib/hermes-gateway/supervisor'
import { getHermesWhatsappStatus } from '@/lib/hermes-gateway/whatsapp-status'
import {
  getHermesMcpApiKey,
  isHermesDestructiveAllowed,
  isHermesEnabled,
  resolveHermesMcpUrl,
} from '@/lib/hermes-mcp/config'

export const dynamic = 'force-dynamic'

async function serializeSettings(request: Request) {
  const settings = await getHermesSettings()
  const apiKey = await getHermesMcpApiKey()
  const fromEnvMcp = Boolean(String(process.env.HERMES_MCP_API_KEY || '').trim())
  const [gateway, whatsapp] = await Promise.all([getGatewayStatus(), getHermesWhatsappStatus()])

  return {
    enabled: await isHermesEnabled(),
    mcpUrl: resolveHermesMcpUrl(request),
    hasMcpKey: Boolean(apiKey),
    mcpApiKeySource: fromEnvMcp ? 'env' : apiKey ? 'database' : 'none',
    mcpApiKeyMasked: maskSecret(apiKey),
    modelProvider: settings.modelProvider,
    ollamaModel: settings.ollamaModel,
    ollamaApiKeyMasked: maskSecret(settings.ollamaApiKey),
    hasOllamaKey: Boolean(settings.ollamaApiKey),
    deepseekModel: settings.deepseekModel,
    deepseekApiKeyMasked: maskSecret(settings.deepseekApiKey),
    hasDeepseekKey: Boolean(settings.deepseekApiKey),
    hasActiveLlmKey: Boolean(resolveActiveLlm(settings).apiKey),
    whatsappMode: settings.whatsappMode,
    allowedUsers: settings.allowedUsers,
    allowDestructive: await isHermesDestructiveAllowed(),
    gateway,
    whatsapp,
  }
}

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response
  return NextResponse.json(await serializeSettings(request))
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  try {
  const current = await getHermesSettings()
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : current.enabled
  const modelProvider =
    typeof body.modelProvider === 'string'
      ? normalizeModelProvider(body.modelProvider)
      : current.modelProvider
  const ollamaModel =
    typeof body.ollamaModel === 'string' && body.ollamaModel.trim()
      ? body.ollamaModel.trim()
      : current.ollamaModel
  const deepseekModel =
    typeof body.deepseekModel === 'string' && body.deepseekModel.trim()
      ? body.deepseekModel.trim()
      : current.deepseekModel
  const whatsappMode =
    typeof body.whatsappMode === 'string'
      ? normalizeWhatsappMode(body.whatsappMode)
      : current.whatsappMode
  const allowedUsers =
    body.allowedUsers !== undefined
      ? normalizeAllowedUsers(body.allowedUsers)
      : current.allowedUsers
  const allowDestructive =
    typeof body.allowDestructive === 'boolean' ? body.allowDestructive : current.allowDestructive

  let ollamaApiKey = current.ollamaApiKey
  if (typeof body.ollamaApiKey === 'string' && body.ollamaApiKey.trim()) {
    ollamaApiKey = body.ollamaApiKey.trim()
  }

  let deepseekApiKey = current.deepseekApiKey
  if (typeof body.deepseekApiKey === 'string' && body.deepseekApiKey.trim()) {
    deepseekApiKey = body.deepseekApiKey.trim()
  }

  const nextSettings = {
    ...current,
    enabled,
    modelProvider,
    ollamaApiKey,
    ollamaModel,
    deepseekApiKey,
    deepseekModel,
    whatsappMode,
    allowedUsers,
    allowDestructive,
  }

  if (enabled && !resolveActiveLlm(nextSettings).apiKey) {
    return NextResponse.json({ error: activeLlmMissingKeyMessage(nextSettings) }, { status: 400 })
  }
  if (enabled && allowedUsers.length === 0) {
    return NextResponse.json(
      { error: 'Indica al menos un teléfono admin permitido' },
      { status: 400 },
    )
  }

  const fromEnvMcp = Boolean(String(process.env.HERMES_MCP_API_KEY || '').trim())
  let mcpApiKey = current.mcpApiKey
  let generatedMcpKey: string | null = null
  if (enabled && !fromEnvMcp && !mcpApiKey) {
    generatedMcpKey = randomBytes(32).toString('hex')
    mcpApiKey = generatedMcpKey
  }

  const fromEnvApiServer = Boolean(String(process.env.HERMES_API_SERVER_KEY || '').trim())
  let apiServerKey = current.apiServerKey
  if (enabled && !fromEnvApiServer && !apiServerKey) {
    apiServerKey = randomBytes(32).toString('hex')
  }

  await prisma.clubSettings.upsert({
    where: { isDefault: true },
    update: {
      hermesEnabled: enabled,
      hermesModelProvider: modelProvider,
      hermesOllamaApiKey: ollamaApiKey,
      hermesOllamaModel: ollamaModel,
      hermesDeepseekApiKey: deepseekApiKey,
      hermesDeepseekModel: deepseekModel,
      hermesWhatsappMode: whatsappMode,
      hermesAllowedUsers: allowedUsers,
      hermesAllowDestructive: allowDestructive,
      ...(mcpApiKey && !fromEnvMcp ? { hermesMcpApiKey: mcpApiKey } : {}),
      ...(apiServerKey && !fromEnvApiServer ? { hermesApiServerKey: apiServerKey } : {}),
    },
    create: {
      isDefault: true,
      name: 'Furvoley',
      hermesEnabled: enabled,
      hermesModelProvider: modelProvider,
      hermesOllamaApiKey: ollamaApiKey,
      hermesOllamaModel: ollamaModel,
      hermesDeepseekApiKey: deepseekApiKey,
      hermesDeepseekModel: deepseekModel,
      hermesWhatsappMode: whatsappMode,
      hermesAllowedUsers: allowedUsers,
      hermesAllowDestructive: allowDestructive,
      hermesMcpApiKey: mcpApiKey,
      hermesApiServerKey: apiServerKey,
    },
  })

  await writeHermesConfigFiles()

  let gatewayResult: {
    ok: boolean
    error?: string
    apiServerReady?: boolean
    pending?: boolean
    message?: string
  } = { ok: true }

  try {
    if (enabled) {
      void scheduleGatewayRestart()
      gatewayResult = {
        ok: true,
        pending: true,
        message: 'Configuración guardada. Reiniciando gateway en segundo plano…',
      }
    } else {
      await stopGateway()
    }
  } catch (e) {
    gatewayResult = {
      ok: false,
      error: e instanceof Error ? e.message : 'No se pudo reiniciar el gateway',
    }
  }

  return NextResponse.json({
    ok: true,
    settings: await serializeSettings(request),
    gatewayResult,
    generatedMcpKey,
  })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error al guardar la configuración'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: { action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (body.action === 'regenerate_key') {
    if (String(process.env.HERMES_MCP_API_KEY || '').trim()) {
      return NextResponse.json(
        { error: 'HERMES_MCP_API_KEY está definida en Railway; cámbiala allí.' },
        { status: 409 },
      )
    }

    const newKey = randomBytes(32).toString('hex')
    await prisma.clubSettings.upsert({
      where: { isDefault: true },
      update: { hermesMcpApiKey: newKey },
      create: { isDefault: true, name: 'Furvoley', hermesMcpApiKey: newKey },
    })

    await writeHermesConfigFiles()
    if (await isHermesEnabled()) {
      void scheduleGatewayRestart()
    }

    return NextResponse.json({
      ok: true,
      apiKey: newKey,
      apiKeyMasked: maskSecret(newKey),
      mcpUrl: resolveHermesMcpUrl(request),
    })
  }

  return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 })
}

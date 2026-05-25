import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { writeHermesConfigFiles } from '@/lib/hermes-gateway/config-writer'
import {
  getHermesSettings,
  maskSecret,
  normalizeAllowedUsers,
  normalizeWhatsappMode,
} from '@/lib/hermes-gateway/settings'
import { getGatewayStatus, restartGateway, stopGateway } from '@/lib/hermes-gateway/supervisor'
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
    ollamaModel: settings.ollamaModel,
    ollamaApiKeyMasked: maskSecret(settings.ollamaApiKey),
    hasOllamaKey: Boolean(settings.ollamaApiKey),
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

  const current = await getHermesSettings()
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : current.enabled
  const ollamaModel =
    typeof body.ollamaModel === 'string' && body.ollamaModel.trim()
      ? body.ollamaModel.trim()
      : current.ollamaModel
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

  if (enabled && !ollamaApiKey) {
    return NextResponse.json(
      { error: 'Indica la API key de Ollama Cloud para activar Hermes' },
      { status: 400 },
    )
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

  await prisma.clubSettings.upsert({
    where: { isDefault: true },
    update: {
      hermesEnabled: enabled,
      hermesOllamaApiKey: ollamaApiKey,
      hermesOllamaModel: ollamaModel,
      hermesWhatsappMode: whatsappMode,
      hermesAllowedUsers: allowedUsers,
      hermesAllowDestructive: allowDestructive,
      ...(mcpApiKey && !fromEnvMcp ? { hermesMcpApiKey: mcpApiKey } : {}),
    },
    create: {
      isDefault: true,
      name: 'Furvoley',
      hermesEnabled: enabled,
      hermesOllamaApiKey: ollamaApiKey,
      hermesOllamaModel: ollamaModel,
      hermesWhatsappMode: whatsappMode,
      hermesAllowedUsers: allowedUsers,
      hermesAllowDestructive: allowDestructive,
      hermesMcpApiKey: mcpApiKey,
    },
  })

  await writeHermesConfigFiles()

  let gatewayResult: { ok: boolean; error?: string } = { ok: true }
  if (enabled) {
    gatewayResult = await restartGateway()
  } else {
    await stopGateway()
  }

  return NextResponse.json({
    ok: true,
    settings: await serializeSettings(request),
    gatewayResult,
    generatedMcpKey,
  })
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
      await restartGateway()
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

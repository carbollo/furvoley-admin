import { randomBytes } from 'node:crypto'
import { access, cp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import {
  getHermesMcpApiKey,
  getHermesApiServerKey,
  resolveHermesMcpUrlForGateway,
} from '@/lib/hermes-mcp/config'
import {
  getHermesHome,
  getHermesSettings,
  getHermesApiServerPort,
  getHermesWhatsappBridgePort,
  resolveActiveLlm,
} from '@/lib/hermes-gateway/settings'
import { isWhatsappPaired, whatsappSessionDir } from '@/lib/hermes-gateway/whatsapp-pairing'

function yamlQuote(value: string) {
  return JSON.stringify(value)
}

async function syncHermesSkills(home: string) {
  const src = path.join(process.cwd(), 'skills', 'furvoley-crm')
  const dst = path.join(home, 'skills', 'furvoley-crm')
  try {
    await access(src)
    await mkdir(path.join(home, 'skills'), { recursive: true })
    await cp(src, dst, { recursive: true, force: true })
  } catch {
    //
  }
}

/** Backfill DB key so MCP auth always matches config.yaml headers. */
async function ensureHermesMcpApiKey(settings: Awaited<ReturnType<typeof getHermesSettings>>) {
  const fromEnv = String(process.env.HERMES_MCP_API_KEY || '').trim()
  if (fromEnv) return fromEnv
  if (settings.mcpApiKey) return settings.mcpApiKey
  if (!settings.enabled) return ''

  const key = randomBytes(32).toString('hex')
  await prisma.clubSettings.upsert({
    where: { isDefault: true },
    update: { hermesMcpApiKey: key },
    create: { isDefault: true, name: 'Furvoley', hermesMcpApiKey: key },
  })
  return key
}

/** Backfill DB key so API_SERVER_ENABLED always has a matching API_SERVER_KEY. */
async function ensureHermesApiServerKey(settings: Awaited<ReturnType<typeof getHermesSettings>>) {
  const fromEnv = String(process.env.HERMES_API_SERVER_KEY || '').trim()
  if (fromEnv) return fromEnv
  if (settings.apiServerKey) return settings.apiServerKey
  if (!settings.enabled) return ''

  const key = randomBytes(32).toString('hex')
  await prisma.clubSettings.upsert({
    where: { isDefault: true },
    update: { hermesApiServerKey: key },
    create: { isDefault: true, name: 'Furvoley', hermesApiServerKey: key },
  })
  return key
}

export async function writeHermesConfigFiles() {
  const home = getHermesHome()
  await mkdir(home, { recursive: true })

  const settings = await getHermesSettings()
  const mcpKey =
    (await getHermesMcpApiKey()) ||
    settings.mcpApiKey ||
    (await ensureHermesMcpApiKey(settings))
  const apiServerKey =
    (await getHermesApiServerKey()) || (await ensureHermesApiServerKey(settings))
  const mcpUrl = resolveHermesMcpUrlForGateway()
  const bridgePort = getHermesWhatsappBridgePort()
  const apiServerPort = getHermesApiServerPort()
  const bridgeScript =
    process.env.HERMES_BRIDGE_SCRIPT || '/opt/hermes-whatsapp-bridge/bridge.js'
  const sessionPath = whatsappSessionDir()
  const whatsappPaired = await isWhatsappPaired()
  const allowedUsers = settings.allowedUsers
  const allowedYaml =
    allowedUsers.length > 0
      ? allowedUsers.map((u) => `      - ${yamlQuote(u)}`).join('\n')
      : '      []'
  const allowedUsersEnv = allowedUsers.join(',')
  const activeLlm = resolveActiveLlm(settings)

  const configYaml = `# Generado por Furvoley CRM — no editar a mano
model:
  provider: ${activeLlm.provider}
  default: ${yamlQuote(activeLlm.model)}

mcp_servers:
  furvoley_crm:
    url: ${yamlQuote(mcpUrl)}
    headers:
      Authorization: ${yamlQuote(`Bearer ${mcpKey}`)}
    timeout: 180

platform_toolsets:
  api_server:
    - hermes-api-server
    - furvoley_crm
  whatsapp:
    - hermes-whatsapp
    - furvoley_crm

unauthorized_dm_behavior: pair

whatsapp:
  unauthorized_dm_behavior: ignore
  allow_from:
${allowedYaml}

platforms:
  whatsapp:
    enabled: ${whatsappPaired ? 'true' : 'false'}
    extra:
      bridge_port: ${bridgePort}
      bridge_script: ${yamlQuote(bridgeScript)}
      session_path: ${yamlQuote(sessionPath)}
      unauthorized_dm_behavior: ignore
      allow_from:
${allowedYaml}
  api_server:
    enabled: ${settings.enabled && apiServerKey ? 'true' : 'false'}
    extra:
      port: ${apiServerPort}
      host: 127.0.0.1
      model_name: hermes-agent
`

  const envLines = ['# Generado por Furvoley CRM']
  envLines.push(`WHATSAPP_ENABLED=${whatsappPaired ? 'true' : 'false'}`)
  envLines.push(`WHATSAPP_MODE=${settings.whatsappMode}`)
  envLines.push(`WHATSAPP_ALLOWED_USERS=${allowedUsersEnv}`)
  envLines.push(`WHATSAPP_BRIDGE_PORT=${bridgePort}`)

  if (settings.enabled && apiServerKey) {
    envLines.push('API_SERVER_ENABLED=true')
    envLines.push('API_SERVER_HOST=127.0.0.1')
    envLines.push(`API_SERVER_PORT=${apiServerPort}`)
    envLines.push(`API_SERVER_KEY=${apiServerKey}`)
    envLines.push('API_SERVER_MODEL_NAME=hermes-agent')
  } else {
    envLines.push('API_SERVER_ENABLED=false')
  }

  if (mcpKey) {
    envLines.push(`HERMES_MCP_API_KEY=${mcpKey}`)
  }

  if (activeLlm.provider === 'deepseek') {
    if (activeLlm.apiKey) {
      envLines.push(`DEEPSEEK_API_KEY=${activeLlm.apiKey}`)
    }
  } else {
    if (activeLlm.apiKey) {
      envLines.push(`OLLAMA_API_KEY=${activeLlm.apiKey}`)
    }
    if (activeLlm.model) {
      envLines.push(`OLLAMA_MODEL=${activeLlm.model}`)
    }
  }

  await Promise.all([
    writeFile(path.join(home, 'config.yaml'), configYaml, 'utf8'),
    writeFile(path.join(home, '.env'), `${envLines.join('\n')}\n`, 'utf8'),
    syncHermesSkills(home),
  ])

  return {
    home,
    enabled: settings.enabled,
    modelProvider: activeLlm.provider,
    hasLlmKey: Boolean(activeLlm.apiKey),
    hasOllamaKey: Boolean(settings.ollamaApiKey),
    hasDeepseekKey: Boolean(settings.deepseekApiKey),
    hasMcpKey: Boolean(mcpKey),
    hasApiServerKey: Boolean(apiServerKey),
    bridgePort,
    mcpUrl,
  }
}

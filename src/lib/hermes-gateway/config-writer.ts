import { access, cp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getHermesMcpApiKey, resolveHermesMcpUrlForGateway } from '@/lib/hermes-mcp/config'
import {
  getHermesHome,
  getHermesSettings,
  getHermesWhatsappBridgePort,
} from '@/lib/hermes-gateway/settings'
import { whatsappSessionDir } from '@/lib/hermes-gateway/whatsapp-pairing'

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

export async function writeHermesConfigFiles() {
  const home = getHermesHome()
  await mkdir(home, { recursive: true })

  const settings = await getHermesSettings()
  const mcpKey = (await getHermesMcpApiKey()) || settings.mcpApiKey || ''
  const mcpUrl = resolveHermesMcpUrlForGateway()
  const bridgePort = getHermesWhatsappBridgePort()
  const bridgeScript =
    process.env.HERMES_BRIDGE_SCRIPT || '/opt/hermes-whatsapp-bridge/bridge.js'
  const sessionPath = whatsappSessionDir()
  const allowedUsers = settings.allowedUsers
  const allowedYaml =
    allowedUsers.length > 0
      ? allowedUsers.map((u) => `      - ${yamlQuote(u)}`).join('\n')
      : '      []'
  const allowedUsersEnv = allowedUsers.join(',')

  const configYaml = `# Generado por Furvoley CRM — no editar a mano
model:
  provider: ollama-cloud
  default: ${yamlQuote(settings.ollamaModel)}

mcp_servers:
  furvoley_crm:
    url: ${yamlQuote(mcpUrl)}
    headers:
      Authorization: ${yamlQuote(`Bearer ${mcpKey}`)}
    timeout: 180

unauthorized_dm_behavior: pair

whatsapp:
  unauthorized_dm_behavior: ignore
  allow_from:
${allowedYaml}

platforms:
  whatsapp:
    enabled: true
    extra:
      bridge_port: ${bridgePort}
      bridge_script: ${yamlQuote(bridgeScript)}
      session_path: ${yamlQuote(sessionPath)}
      unauthorized_dm_behavior: ignore
      allow_from:
${allowedYaml}
`

  const envLines = [
    '# Generado por Furvoley CRM',
    'WHATSAPP_ENABLED=true',
    `WHATSAPP_MODE=${settings.whatsappMode}`,
    `WHATSAPP_ALLOWED_USERS=${allowedUsersEnv}`,
    `WHATSAPP_BRIDGE_PORT=${bridgePort}`,
  ]
  if (settings.ollamaApiKey) {
    envLines.push(`OLLAMA_API_KEY=${settings.ollamaApiKey}`)
  }
  if (settings.ollamaModel) {
    envLines.push(`OLLAMA_MODEL=${settings.ollamaModel}`)
  }

  await Promise.all([
    writeFile(path.join(home, 'config.yaml'), configYaml, 'utf8'),
    writeFile(path.join(home, '.env'), `${envLines.join('\n')}\n`, 'utf8'),
    syncHermesSkills(home),
  ])

  return {
    home,
    enabled: settings.enabled,
    hasOllamaKey: Boolean(settings.ollamaApiKey),
    hasMcpKey: Boolean(mcpKey),
    bridgePort,
    mcpUrl,
  }
}

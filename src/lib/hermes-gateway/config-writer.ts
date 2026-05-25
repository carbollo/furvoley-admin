import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getHermesMcpApiKey, resolveHermesMcpUrl } from '@/lib/hermes-mcp/config'
import { getHermesHome, getHermesSettings } from '@/lib/hermes-gateway/settings'

function yamlQuote(value: string) {
  return JSON.stringify(value)
}

export async function writeHermesConfigFiles(opts?: { mcpUrl?: string }) {
  const home = getHermesHome()
  await mkdir(home, { recursive: true })

  const settings = await getHermesSettings()
  const mcpKey = (await getHermesMcpApiKey()) || settings.mcpApiKey || ''
  const mcpUrl = opts?.mcpUrl || resolveHermesMcpUrl()
  const allowedUsers = settings.allowedUsers
  const allowedYaml =
    allowedUsers.length > 0
      ? allowedUsers.map((u) => `      - ${yamlQuote(u)}`).join('\n')
      : '      []'

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

platforms:
  whatsapp:
    enabled: true
    mode: ${yamlQuote(settings.whatsappMode)}
    bridge_script: ${yamlQuote(process.env.HERMES_BRIDGE_SCRIPT || '/opt/hermes-whatsapp-bridge/bridge.js')}
    allowed_users:
${allowedYaml}
`

  const envLines = ['# Generado por Furvoley CRM']
  if (settings.ollamaApiKey) {
    envLines.push(`OLLAMA_API_KEY=${settings.ollamaApiKey}`)
  }

  await Promise.all([
    writeFile(path.join(home, 'config.yaml'), configYaml, 'utf8'),
    writeFile(path.join(home, '.env'), `${envLines.join('\n')}\n`, 'utf8'),
  ])

  return { home, enabled: settings.enabled, hasOllamaKey: Boolean(settings.ollamaApiKey), hasMcpKey: Boolean(mcpKey) }
}

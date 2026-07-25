import { getHermesApiServerPort } from '@/lib/hermes-gateway/settings'
import { readApiServerLogHint, isHermesAiohttpInstalled } from '@/lib/hermes-gateway/api-server-diagnostics'
import { isTcpPortOpen } from '@/lib/hermes-gateway/port-utils'
import { getHermesApiServerKey } from '@/lib/hermes-mcp/config'

export type HermesChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const HERMES_CRM_SYSTEM_PROMPT = `Eres el asistente del administrador del CRM ProClubCRM.

Tienes tools MCP del CRM con prefijo mcp_furvoley_crm_ (por ejemplo mcp_furvoley_crm_crm_search_members, mcp_furvoley_crm_crm_get_kpis, mcp_furvoley_crm_crm_get_member).

Reglas:
- Responde en español salvo que el admin escriba en otro idioma.
- Para datos del CRM (socios, cobros, KPIs, equipos) SIEMPRE usa las tools MCP; no pidas URL ni tokens.
- Busca socios con mcp_furvoley_crm_crm_search_members si solo tienes el nombre.
- Confirma importes antes de crear cobros o altas masivas.
- WhatsApp Hermes es control admin; para avisar a un socio usa mcp_furvoley_crm_crm_send_whatsapp_member.`

function apiServerBaseUrl() {
  const port = getHermesApiServerPort()
  return `http://127.0.0.1:${port}`
}

function isHealthOkBody(data: unknown) {
  if (!data || typeof data !== 'object') return false
  const status = String((data as { status?: string }).status || '').toLowerCase()
  return status === 'ok' || status === 'healthy'
}

async function probeHealthPath(path: string) {
  const res = await fetch(`${apiServerBaseUrl()}${path}`, {
    signal: AbortSignal.timeout(2500),
  })
  if (!res.ok) return false
  const data = (await res.json()) as unknown
  return isHealthOkBody(data)
}

export async function probeHermesApiServerHealth(): Promise<{
  healthy: boolean
  port: number
}> {
  const port = getHermesApiServerPort()
  try {
    for (const path of ['/health', '/v1/health']) {
      if (await probeHealthPath(path)) return { healthy: true, port }
    }
    return { healthy: false, port }
  } catch {
    return { healthy: false, port }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForHermesApiServerReady(opts?: {
  maxMs?: number
  intervalMs?: number
}) {
  const maxMs = opts?.maxMs ?? 25000
  const intervalMs = opts?.intervalMs ?? 500
  const start = Date.now()
  let last = await probeHermesApiServerHealth()
  while (!last.healthy && Date.now() - start < maxMs) {
    await sleep(intervalMs)
    last = await probeHermesApiServerHealth()
  }
  return last
}

export async function getHermesApiServerStatus() {
  const port = getHermesApiServerPort()
  const hasKey = Boolean(await getHermesApiServerKey())
  const aiohttpInstalled = isHermesAiohttpInstalled()
  const [health, portOpen, logHint] = await Promise.all([
    probeHermesApiServerHealth(),
    isTcpPortOpen(port),
    readApiServerLogHint(),
  ])
  const aiohttpError = aiohttpInstalled
    ? undefined
    : 'Falta el paquete Python aiohttp (pip install aiohttp==3.13.3)'
  return {
    port,
    hasKey,
    aiohttpInstalled,
    healthy: aiohttpInstalled && health.healthy,
    portOpen,
    logHint: aiohttpError || logHint,
  }
}

export async function proxyChatCompletions(opts: {
  messages: HermesChatMessage[]
  stream?: boolean
}): Promise<Response> {
  const apiKey = await getHermesApiServerKey()
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Falta API_SERVER_KEY de Hermes' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const upstream = await fetch(`${apiServerBaseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: opts.stream ? 'text/event-stream' : 'application/json',
    },
    body: JSON.stringify({
      model: 'hermes-agent',
      messages: opts.messages,
      stream: Boolean(opts.stream),
    }),
  })

  if (opts.stream) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
    },
  })
}

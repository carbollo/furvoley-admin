import { getHermesMcpApiKey, resolveHermesMcpUrlForGateway } from '@/lib/hermes-mcp/config'
import { readGatewayLogTail } from '@/lib/hermes-gateway/supervisor'

export type HermesMcpProbeResult = {
  ok: boolean
  toolCount: number
  error?: string
  url: string
  hasKey: boolean
}

function mcpHeaders(apiKey: string, sessionId?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (sessionId) headers['mcp-session-id'] = sessionId
  return headers
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    const line = text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('data:'))
    if (!line) throw new Error('Respuesta MCP no JSON')
    return JSON.parse(line.slice(5).trim()) as unknown
  }
}

export async function probeHermesMcpEndpoint(): Promise<HermesMcpProbeResult> {
  const url = resolveHermesMcpUrlForGateway()
  const apiKey = (await getHermesMcpApiKey()) || ''
  if (!apiKey) {
    return { ok: false, toolCount: 0, error: 'Falta clave MCP', url, hasKey: false }
  }

  try {
    const initRes = await fetch(url, {
      method: 'POST',
      headers: mcpHeaders(apiKey),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'furvoley-probe', version: '1.0.0' },
        },
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!initRes.ok) {
      return {
        ok: false,
        toolCount: 0,
        error: `initialize HTTP ${initRes.status}`,
        url,
        hasKey: true,
      }
    }

    const sessionId = initRes.headers.get('mcp-session-id') || undefined
    if (!sessionId) {
      return {
        ok: false,
        toolCount: 0,
        error: 'Sin mcp-session-id en initialize',
        url,
        hasKey: true,
      }
    }

    const toolsRes = await fetch(url, {
      method: 'POST',
      headers: mcpHeaders(apiKey, sessionId),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!toolsRes.ok) {
      return {
        ok: false,
        toolCount: 0,
        error: `tools/list HTTP ${toolsRes.status}`,
        url,
        hasKey: true,
      }
    }

    const toolsJson = (await readJsonBody(toolsRes)) as {
      result?: { tools?: unknown[] }
      error?: { message?: string }
    }
    if (toolsJson.error?.message) {
      return {
        ok: false,
        toolCount: 0,
        error: toolsJson.error.message,
        url,
        hasKey: true,
      }
    }

    const toolCount = Array.isArray(toolsJson.result?.tools) ? toolsJson.result.tools.length : 0
    return {
      ok: toolCount > 0,
      toolCount,
      error: toolCount > 0 ? undefined : 'El servidor MCP no expone tools',
      url,
      hasKey: true,
    }
  } catch (e) {
    return {
      ok: false,
      toolCount: 0,
      error: e instanceof Error ? e.message : 'Probe MCP falló',
      url,
      hasKey: true,
    }
  }
}

export async function waitForHermesMcpReady(opts?: { maxMs?: number; intervalMs?: number }) {
  const maxMs = opts?.maxMs ?? 45000
  const intervalMs = opts?.intervalMs ?? 1500
  const start = Date.now()
  let last = await probeHermesMcpEndpoint()
  while (!last.ok && Date.now() - start < maxMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    last = await probeHermesMcpEndpoint()
  }
  return last
}

export async function readGatewayMcpLogHint(): Promise<string | undefined> {
  const tail = await readGatewayLogTail(40)
  if (!tail) return undefined
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]
    if (/mcp/i.test(line) && /(fail|error|401|refused|timeout|0 tool)/i.test(line)) {
      return line.trim()
    }
  }
  const summary = lines.find((line) => /MCP:/i.test(line))
  return summary?.trim()
}

export async function getHermesMcpStatus() {
  const [probe, logHint] = await Promise.all([probeHermesMcpEndpoint(), readGatewayMcpLogHint()])
  return {
    url: probe.url,
    hasKey: probe.hasKey,
    endpointReady: probe.ok,
    toolCount: probe.toolCount,
    error: probe.error,
    logHint,
  }
}

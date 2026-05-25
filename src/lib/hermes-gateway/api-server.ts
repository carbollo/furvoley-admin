import { getHermesApiServerPort } from '@/lib/hermes-gateway/settings'
import { readApiServerLogHint } from '@/lib/hermes-gateway/api-server-diagnostics'
import { isTcpPortOpen } from '@/lib/hermes-gateway/port-utils'
import { getHermesApiServerKey } from '@/lib/hermes-mcp/config'

export type HermesChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

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
  const [health, portOpen, logHint] = await Promise.all([
    probeHermesApiServerHealth(),
    isTcpPortOpen(port),
    readApiServerLogHint(),
  ])
  return {
    port,
    hasKey,
    healthy: health.healthy,
    portOpen,
    logHint,
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

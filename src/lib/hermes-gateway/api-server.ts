import { getHermesApiServerPort } from '@/lib/hermes-gateway/settings'
import { getHermesApiServerKey } from '@/lib/hermes-mcp/config'

export type HermesChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function apiServerBaseUrl() {
  const port = getHermesApiServerPort()
  return `http://127.0.0.1:${port}`
}

export async function probeHermesApiServerHealth(): Promise<{
  healthy: boolean
  port: number
}> {
  const port = getHermesApiServerPort()
  try {
    const res = await fetch(`${apiServerBaseUrl()}/health`, {
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) return { healthy: false, port }
    const data = (await res.json()) as { status?: string }
    return { healthy: String(data?.status || '').toLowerCase() === 'ok', port }
  } catch {
    return { healthy: false, port }
  }
}

export async function getHermesApiServerStatus() {
  const port = getHermesApiServerPort()
  const hasKey = Boolean(await getHermesApiServerKey())
  const health = await probeHermesApiServerHealth()
  return {
    port,
    hasKey,
    healthy: health.healthy,
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

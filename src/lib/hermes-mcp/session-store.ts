import { randomUUID } from 'node:crypto'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { createHermesMcpServer } from '@/lib/hermes-mcp/server'

type SessionEntry = {
  transport: WebStandardStreamableHTTPServerTransport
}

declare global {
  // eslint-disable-next-line no-var
  var __hermesMcpSessions: Map<string, SessionEntry> | undefined
}

const sessions = globalThis.__hermesMcpSessions ?? new Map<string, SessionEntry>()
globalThis.__hermesMcpSessions = sessions

function jsonRpcError(status: number, code: number, message: string) {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  )
}

export async function handleHermesMcpRequest(
  request: Request,
  parsedBody?: unknown,
): Promise<Response> {
  const sessionId = request.headers.get('mcp-session-id') || undefined

  if (sessionId && sessions.has(sessionId)) {
    const { transport } = sessions.get(sessionId)!
    return transport.handleRequest(request, { parsedBody })
  }

  if (request.method === 'POST') {
    let body = parsedBody
    if (body === undefined) {
      try {
        body = await request.clone().json()
      } catch {
        return jsonRpcError(400, -32700, 'JSON inválido')
      }
    }

    if (!sessionId && isInitializeRequest(body)) {
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, { transport })
        },
      })

      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid) sessions.delete(sid)
      }

      const server = createHermesMcpServer()
      await server.connect(transport)
      return transport.handleRequest(request, { parsedBody: body })
    }

    if (!sessionId) {
      return jsonRpcError(400, -32000, 'Bad Request: No valid session ID provided')
    }
    return jsonRpcError(404, -32001, 'Session not found')
  }

  if (!sessionId || !sessions.has(sessionId)) {
    return new Response('Invalid or missing session ID', { status: 400 })
  }

  const { transport } = sessions.get(sessionId)!
  return transport.handleRequest(request, { parsedBody })
}

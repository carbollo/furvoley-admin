import { getHermesMcpApiKey, isHermesEnabled } from '@/lib/hermes-mcp/config'

export type HermesAuthResult =
  | { ok: true; apiKey: string }
  | { ok: false; status: number; message: string }

export async function verifyHermesMcpAuth(request: Request): Promise<HermesAuthResult> {
  if (!isHermesEnabled()) {
    return { ok: false, status: 503, message: 'Hermes MCP desactivado (HERMES_ENABLED=false)' }
  }

  const expected = await getHermesMcpApiKey()
  if (!expected) {
    const isProd = process.env.NODE_ENV === 'production'
    if (isProd) {
      return { ok: false, status: 503, message: 'Falta HERMES_MCP_API_KEY' }
    }
    return { ok: false, status: 401, message: 'Configura HERMES_MCP_API_KEY en env o en el CRM' }
  }

  const header = request.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim()
  if (!token || token !== expected) {
    return { ok: false, status: 401, message: 'API key MCP inválida' }
  }

  return { ok: true, apiKey: token }
}

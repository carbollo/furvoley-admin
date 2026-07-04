import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { proxyChatCompletions, type HermesChatMessage, HERMES_CRM_SYSTEM_PROMPT } from '@/lib/hermes-gateway/api-server'
import { getGatewayStatus } from '@/lib/hermes-gateway/supervisor'
import { isHermesEnabled } from '@/lib/hermes-mcp/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function normalizeMessages(raw: unknown): HermesChatMessage[] | null {
  if (!Array.isArray(raw)) return null
  const messages: HermesChatMessage[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const role = String((item as { role?: string }).role || '').trim()
    const content = String((item as { content?: string }).content || '').trim()
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return null
    if (!content) continue
    messages.push({ role, content })
  }
  return messages.length > 0 ? messages : null
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  if (!(await isHermesEnabled())) {
    return NextResponse.json({ error: 'Hermes no está activado en el CRM' }, { status: 409 })
  }

  const gateway = await getGatewayStatus()
  if (gateway.status !== 'running') {
    return NextResponse.json(
      { error: 'El gateway de Hermes no está en ejecución. Activa Hermes y reinicia el gateway.' },
      { status: 503 },
    )
  }

  let body: { messages?: unknown; stream?: boolean }
  try {
    body = (await request.json()) as { messages?: unknown; stream?: boolean }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const messages = normalizeMessages(body.messages)
  if (!messages) {
    return NextResponse.json({ error: 'Indica al menos un mensaje válido' }, { status: 400 })
  }

  const stream = body.stream !== false
  const hasSystem = messages.some((m) => m.role === 'system')
  const outbound = hasSystem
    ? messages
    : [{ role: 'system' as const, content: HERMES_CRM_SYSTEM_PROMPT }, ...messages]
  const upstream = await proxyChatCompletions({ messages: outbound, stream })

  if (upstream.status >= 400) {
    const errText = await upstream.text()
    let error = 'El API Server de Hermes no respondió'
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } | string }
      if (typeof parsed.error === 'string') error = parsed.error
      else if (parsed.error?.message) error = parsed.error.message
    } catch {
      if (errText.trim()) error = errText.trim().slice(0, 500)
    }
    return NextResponse.json(
      {
        error:
          upstream.status === 503 || upstream.status === 502
            ? 'El chat web requiere el API Server de Hermes. Guarda la configuración y reinicia el gateway.'
            : error,
      },
      { status: upstream.status >= 500 ? 503 : upstream.status },
    )
  }

  if (stream) {
    return upstream
  }

  const json = await upstream.json()
  return NextResponse.json(json)
}

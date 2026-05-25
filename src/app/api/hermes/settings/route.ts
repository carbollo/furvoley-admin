import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import {
  getHermesAllowedUsers,
  getHermesMcpApiKey,
  isHermesDestructiveAllowed,
  isHermesEnabled,
  maskApiKey,
  resolveHermesMcpUrl,
} from '@/lib/hermes-mcp/config'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const apiKey = await getHermesMcpApiKey()
  const fromEnv = Boolean(String(process.env.HERMES_MCP_API_KEY || '').trim())

  return NextResponse.json({
    enabled: isHermesEnabled(),
    mcpUrl: resolveHermesMcpUrl(request),
    hasApiKey: Boolean(apiKey),
    apiKeySource: fromEnv ? 'env' : apiKey ? 'database' : 'none',
    apiKeyMasked: maskApiKey(apiKey),
    destructiveAllowed: isHermesDestructiveAllowed(),
    allowedUsers: getHermesAllowedUsers(),
    envHints: {
      HERMES_ENABLED: isHermesEnabled(),
      DEEPSEEK_API_KEY: Boolean(process.env.DEEPSEEK_API_KEY),
      WHATSAPP_ENABLED: String(process.env.WHATSAPP_ENABLED || '').toLowerCase() === 'true',
    },
  })
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: { action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (body.action !== 'regenerate_key') {
    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 })
  }

  if (String(process.env.HERMES_MCP_API_KEY || '').trim()) {
    return NextResponse.json(
      {
        error:
          'HERMES_MCP_API_KEY está definida en variables de entorno; regenera la clave en Railway.',
      },
      { status: 409 },
    )
  }

  const newKey = randomBytes(32).toString('hex')
  await prisma.clubSettings.upsert({
    where: { isDefault: true },
    update: { hermesMcpApiKey: newKey },
    create: { isDefault: true, name: 'Furvoley', hermesMcpApiKey: newKey },
  })

  return NextResponse.json({
    ok: true,
    apiKey: newKey,
    apiKeyMasked: maskApiKey(newKey),
    mcpUrl: resolveHermesMcpUrl(request),
  })
}

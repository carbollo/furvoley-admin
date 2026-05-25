import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { writeHermesConfigFiles } from '@/lib/hermes-gateway/config-writer'
import { getGatewayStatus, restartGateway } from '@/lib/hermes-gateway/supervisor'
import { resolveHermesMcpUrl } from '@/lib/hermes-mcp/config'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  await writeHermesConfigFiles({ mcpUrl: resolveHermesMcpUrl(request) })
  const result = await restartGateway()
  const status = await getGatewayStatus()

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || 'No se pudo reiniciar el gateway', status },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, status })
}

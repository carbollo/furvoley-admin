import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getHermesApiServerStatus } from '@/lib/hermes-gateway/api-server'
import { getGatewayStatus } from '@/lib/hermes-gateway/supervisor'
import { isHermesEnabled } from '@/lib/hermes-mcp/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const [enabled, gateway, apiServer] = await Promise.all([
    isHermesEnabled(),
    getGatewayStatus(),
    getHermesApiServerStatus(),
  ])

  return NextResponse.json({
    enabled,
    gatewayRunning: gateway.status === 'running',
    gatewayStatus: gateway.status,
    apiServerHealthy: apiServer.healthy,
    apiServerPort: apiServer.port,
    hasApiServerKey: apiServer.hasKey,
    chatReady: enabled && gateway.status === 'running' && apiServer.healthy,
  })
}

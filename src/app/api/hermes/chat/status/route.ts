import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getHermesApiServerStatus } from '@/lib/hermes-gateway/api-server'
import { getHermesMcpStatus } from '@/lib/hermes-gateway/mcp-diagnostics'
import { getGatewayStatus } from '@/lib/hermes-gateway/supervisor'
import { isHermesEnabled } from '@/lib/hermes-mcp/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const [enabled, gateway, apiServer, mcp] = await Promise.all([
    isHermesEnabled(),
    getGatewayStatus(),
    getHermesApiServerStatus(),
    getHermesMcpStatus(),
  ])

  const gatewayRunning = gateway.status === 'running'
  const chatReady = enabled && gatewayRunning && apiServer.healthy
  const crmReady = chatReady && mcp.crmToolsAvailable

  return NextResponse.json({
    enabled,
    gatewayRunning,
    gatewayStatus: gateway.status,
    apiServerHealthy: apiServer.healthy,
    apiServerPort: apiServer.port,
    hasApiServerKey: apiServer.hasKey,
    apiServerAiohttpInstalled: apiServer.aiohttpInstalled,
    apiServerPortOpen: apiServer.portOpen,
    apiServerLogHint: apiServer.logHint,
    mcpReady: mcp.endpointReady,
    mcpToolCount: mcp.toolCount,
    mcpPythonSdkInstalled: mcp.pythonSdkInstalled,
    mcpError: mcp.error,
    chatReady,
    crmReady,
  })
}

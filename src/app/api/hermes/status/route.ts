import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getHermesApiServerStatus } from '@/lib/hermes-gateway/api-server'
import { getGatewayStatus } from '@/lib/hermes-gateway/supervisor'
import { getHermesWhatsappStatus } from '@/lib/hermes-gateway/whatsapp-status'
import {
  isWhatsappPaired,
  isWhatsappPairingActive,
  startWhatsappPairingIfNeeded,
} from '@/lib/hermes-gateway/whatsapp-pairing'
import { isHermesEnabled } from '@/lib/hermes-mcp/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const gateway = await getGatewayStatus()
  let whatsapp = await getHermesWhatsappStatus()
  const apiServer = await getHermesApiServerStatus()

  if ((await isHermesEnabled()) && whatsapp.status !== 'CONNECTED' && gateway.status === 'running') {
    if (!(await isWhatsappPaired()) && !(await isWhatsappPairingActive())) {
      await startWhatsappPairingIfNeeded()
    }
    whatsapp = await getHermesWhatsappStatus()
  }

  return NextResponse.json({
    gateway,
    whatsapp,
    apiServer: {
      healthy: apiServer.healthy,
      port: apiServer.port,
      hasKey: apiServer.hasKey,
      chatReady:
        (await isHermesEnabled()) && gateway.status === 'running' && apiServer.healthy,
    },
  })
}

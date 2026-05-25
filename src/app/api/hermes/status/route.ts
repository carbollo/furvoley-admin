import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getGatewayStatus } from '@/lib/hermes-gateway/supervisor'
import { getHermesWhatsappStatus } from '@/lib/hermes-gateway/whatsapp-status'
import { startWhatsappPairingIfNeeded } from '@/lib/hermes-gateway/whatsapp-pairing'
import { isHermesEnabled } from '@/lib/hermes-mcp/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const gateway = await getGatewayStatus()
  let whatsapp = await getHermesWhatsappStatus()

  if ((await isHermesEnabled()) && whatsapp.status !== 'CONNECTED' && gateway.status === 'running') {
    await startWhatsappPairingIfNeeded()
    whatsapp = await getHermesWhatsappStatus()
  }

  return NextResponse.json({ gateway, whatsapp })
}

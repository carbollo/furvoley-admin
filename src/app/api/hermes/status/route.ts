import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getGatewayStatus } from '@/lib/hermes-gateway/supervisor'
import { getHermesWhatsappStatus } from '@/lib/hermes-gateway/whatsapp-status'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const [gateway, whatsapp] = await Promise.all([getGatewayStatus(), getHermesWhatsappStatus()])

  return NextResponse.json({ gateway, whatsapp })
}

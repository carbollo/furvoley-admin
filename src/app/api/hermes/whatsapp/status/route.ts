import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getHermesWhatsappStatus } from '@/lib/hermes-gateway/whatsapp-status'
import { readHermesGatewayLogTail } from '@/lib/hermes-gateway/whatsapp-status'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const [whatsapp, logs] = await Promise.all([
    getHermesWhatsappStatus(),
    readHermesGatewayLogTail(30),
  ])

  return NextResponse.json({ ...whatsapp, logs })
}

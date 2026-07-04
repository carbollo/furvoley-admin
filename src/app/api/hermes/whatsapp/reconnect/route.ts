import { rm } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { writeHermesConfigFiles } from '@/lib/hermes-gateway/config-writer'
import { scheduleGatewayRestart } from '@/lib/hermes-gateway/supervisor'
import {
  clearWhatsappPairingArtifacts,
  stopWhatsappPairing,
  whatsappSessionDir,
} from '@/lib/hermes-gateway/whatsapp-pairing'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  await stopWhatsappPairing()
  await Promise.all([
    rm(whatsappSessionDir(), { recursive: true, force: true }).catch(() => undefined),
    clearWhatsappPairingArtifacts(),
  ])

  await writeHermesConfigFiles()
  void scheduleGatewayRestart()

  return NextResponse.json({
    ok: true,
    pending: true,
    message: 'Sesión WhatsApp borrada. Reiniciando gateway…',
  })
}

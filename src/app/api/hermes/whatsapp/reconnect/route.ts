import { rm } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { writeHermesConfigFiles } from '@/lib/hermes-gateway/config-writer'
import { restartGateway } from '@/lib/hermes-gateway/supervisor'
import {
  clearWhatsappPairingArtifacts,
  stopWhatsappPairing,
  whatsappSessionDir,
} from '@/lib/hermes-gateway/whatsapp-pairing'

export const dynamic = 'force-dynamic'

export async function POST() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  await stopWhatsappPairing()
  await Promise.all([
    rm(whatsappSessionDir(), { recursive: true, force: true }).catch(() => undefined),
    clearWhatsappPairingArtifacts(),
  ])

  await writeHermesConfigFiles()
  const result = await restartGateway()

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'No se pudo reiniciar Hermes' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

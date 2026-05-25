import { rm } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { writeHermesConfigFiles } from '@/lib/hermes-gateway/config-writer'
import { getHermesHome } from '@/lib/hermes-gateway/settings'
import { restartGateway } from '@/lib/hermes-gateway/supervisor'

export const dynamic = 'force-dynamic'

export async function POST() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const home = getHermesHome()
  const sessionDir = path.join(home, 'platforms', 'whatsapp', 'session')
  const qrFile = path.join(home, 'whatsapp', 'latest_qr.txt')

  await Promise.all([
    rm(sessionDir, { recursive: true, force: true }).catch(() => {}),
    rm(qrFile, { force: true }).catch(() => {}),
  ])

  await writeHermesConfigFiles()
  const result = await restartGateway()

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'No se pudo reiniciar Hermes' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

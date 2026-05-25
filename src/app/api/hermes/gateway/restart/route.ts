import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getHermesApiServerStatus } from '@/lib/hermes-gateway/api-server'
import { writeHermesConfigFiles } from '@/lib/hermes-gateway/config-writer'
import { getGatewayStatus, restartGateway } from '@/lib/hermes-gateway/supervisor'

export const dynamic = 'force-dynamic'

export async function POST() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  await writeHermesConfigFiles()
  const result = await restartGateway()
  const [status, apiServer] = await Promise.all([getGatewayStatus(), getHermesApiServerStatus()])

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || 'No se pudo reiniciar el gateway', status, apiServer },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    status,
    apiServer,
    apiServerReady: result.apiServerReady ?? apiServer.healthy,
    warning: result.apiServerReady === false ? result.error : undefined,
  })
}

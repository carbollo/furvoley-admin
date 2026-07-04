import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getHermesApiServerStatus } from '@/lib/hermes-gateway/api-server'
import { writeHermesConfigFiles } from '@/lib/hermes-gateway/config-writer'
import { getGatewayStatus, scheduleGatewayRestart } from '@/lib/hermes-gateway/supervisor'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  await writeHermesConfigFiles()
  void scheduleGatewayRestart()
  const [status, apiServer] = await Promise.all([getGatewayStatus(), getHermesApiServerStatus()])

  return NextResponse.json({
    ok: true,
    pending: true,
    status,
    apiServer,
    message: 'Reiniciando gateway en segundo plano. El chat estará listo en unos segundos.',
  })
}

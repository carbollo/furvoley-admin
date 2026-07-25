import { NextResponse } from 'next/server'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertModuleForRequest } from '@/lib/rbac-api'
import { installProclubWorkflows } from '@/lib/proclub-workflow-catalog'

export async function POST(request: Request) {
  await enterTenantFromRequest(request)
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const gate = await assertModuleForRequest(request)
  if (gate) return gate

  let body: { ids?: string[]; installAll?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    body = { installAll: true }
  }

  const result = await installProclubWorkflows({
    catalogIds: body.ids,
    installAll: body.installAll ?? !body.ids?.length,
  })

  return NextResponse.json({ ok: true, ...result })
}

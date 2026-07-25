import { NextResponse } from 'next/server'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertModuleForRequest } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { setWorkflowActive } from '@/app/actions/workflows'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await enterTenantFromRequest(_request)
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const gate = await assertModuleForRequest(_request)
  if (gate) return gate

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId
  const wf = await prisma.workflow.findUnique({ where: { id: parsedId } })
  if (!wf) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await setWorkflowActive(parsedId, !wf.isActive)

  return NextResponse.json({ ok: true, active: !wf.isActive })
}

import { NextResponse } from 'next/server'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { parseCuid } from '@/lib/db-input-validation'
import { installWorkflowTemplate } from '@/lib/workflow-template-catalog'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params) {
  await enterTenantFromRequest(_request)
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId
  const result = await installWorkflowTemplate(parsedId)
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 404 })
  }

  return NextResponse.json({ ok: true, workflowId: result.workflowId })
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { installWorkflowTemplate } from '@/lib/workflow-template-catalog'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params
  const result = await installWorkflowTemplate(id)
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 404 })
  }

  return NextResponse.json({ ok: true, workflowId: result.workflowId })
}

import { NextResponse } from 'next/server'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { parseWorkflowsFromJson } from '@/lib/workflow-import'
import {
  createWorkflowTemplatesFromImport,
  listWorkflowTemplates,
  snapshotWorkflowToTemplate,
} from '@/lib/workflow-template-catalog'

export async function GET(request: Request) {
  await enterTenantFromRequest(request)
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const templates = await listWorkflowTemplates()
  return NextResponse.json({ templates })
}

export async function POST(request: Request) {
  await enterTenantFromRequest(request)
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON no válido' }, { status: 400 })
  }

  const workflowId = typeof body.workflowId === 'string' ? body.workflowId.trim() : ''
  if (workflowId) {
    const result = await snapshotWorkflowToTemplate(workflowId)
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 404 })
    }
    return NextResponse.json({ ok: true, created: [result.template] })
  }

  const payload = body.payload !== undefined ? body.payload : body
  const workflows = parseWorkflowsFromJson(payload)
  if (workflows.length === 0) {
    return NextResponse.json(
      { error: 'No se encontraron flujos válidos. Usa el JSON exportado desde Furvoley.' },
      { status: 400 },
    )
  }

  const { created } = await createWorkflowTemplatesFromImport(workflows)
  return NextResponse.json({ ok: true, created })
}

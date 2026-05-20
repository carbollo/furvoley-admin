import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runWorkflowTest } from '@/lib/workflow-test'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await context.params

  let body: Record<string, unknown> = {}
  try {
    const raw = await request.text()
    if (raw.trim()) body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON no válido' }, { status: 400 })
  }

  const memberId =
    typeof body.memberId === 'string' && body.memberId.trim() ? body.memberId.trim() : undefined
  const leadId =
    typeof body.leadId === 'string' && body.leadId.trim() ? body.leadId.trim() : undefined

  const result = await runWorkflowTest(id, { memberId, leadId })

  if (result.error && result.stepsRun === 0 && !result.subjectId) {
    return NextResponse.json({ error: result.error, result }, { status: 400 })
  }

  return NextResponse.json(result)
}

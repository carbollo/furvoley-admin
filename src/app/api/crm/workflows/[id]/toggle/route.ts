import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { setWorkflowActive } from '@/app/actions/workflows'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const wf = await prisma.workflow.findUnique({ where: { id } })
  if (!wf) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await setWorkflowActive(id, !wf.isActive)

  return NextResponse.json({ ok: true, active: !wf.isActive })
}

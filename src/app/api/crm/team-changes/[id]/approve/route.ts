import { NextResponse } from 'next/server'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { runTeamChangeApprovedWorkflows } from '@/lib/workflow-proclub-runners'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId
  await prisma.teamChangeRequest.update({
    where: { id: parsedId },
    data: { status: 'APPROVED', approvedById: auth.session.user.id },
  })

  void runTeamChangeApprovedWorkflows(parsedId).catch((e) => {
    console.warn('[team-change] WD-10 failed:', e)
  })

  return NextResponse.json({ ok: true })
}

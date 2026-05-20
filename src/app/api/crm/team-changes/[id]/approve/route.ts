import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { runTeamChangeApprovedWorkflows } from '@/lib/workflow-proclub-runners'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id } = await params
  await prisma.teamChangeRequest.update({
    where: { id },
    data: { status: 'APPROVED', approvedById: auth.session.user.id },
  })

  void runTeamChangeApprovedWorkflows(id).catch((e) => {
    console.warn('[team-change] WD-10 failed:', e)
  })

  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { runTeamScheduleChangedWorkflows } from '@/lib/workflow-engine'

type Params = { params: Promise<{ id: string; scheduleId: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id: teamId, scheduleId } = await params
  const parsedTeamId = parseCuid(teamId, 'teamId')
  if (parsedTeamId instanceof Response) return parsedTeamId
  const parsedScheduleId = parseCuid(scheduleId, 'scheduleId')
  if (parsedScheduleId instanceof Response) return parsedScheduleId
  try {
    await prisma.teamSchedule.deleteMany({
      where: { id: parsedScheduleId, teamId: parsedTeamId },
    })
  } catch {
    return NextResponse.json({ error: 'Horario no encontrado' }, { status: 404 })
  }

  void runTeamScheduleChangedWorkflows(parsedTeamId).catch((err) => {
    console.warn('[schedules] WD-2 workflow failed:', err)
  })

  return NextResponse.json({ ok: true })
}

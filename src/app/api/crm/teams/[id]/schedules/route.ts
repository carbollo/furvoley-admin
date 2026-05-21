import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'
import { runTeamScheduleChangedWorkflows } from '@/lib/workflow-engine'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id: teamId } = await params
  const parsedTeamId = parseCuid(teamId, 'teamId')
  if (parsedTeamId instanceof Response) return parsedTeamId
  const rows = await prisma.teamSchedule.findMany({
    where: { teamId: parsedTeamId },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
  })
  return NextResponse.json({
    schedules: rows.map((r) => ({
      id: r.id,
      weekday: r.weekday,
      startTime: r.startTime,
      durationMinutes: r.durationMinutes,
      title: r.title,
      location: r.location,
    })),
  })
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id: teamId } = await params
  const parsedTeamId = parseCuid(teamId, 'teamId')
  if (parsedTeamId instanceof Response) return parsedTeamId
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const weekday = Number(body.weekday)
  const startTime = String(body.startTime || '').trim()
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return NextResponse.json({ error: 'weekday debe ser 0-6' }, { status: 400 })
  }
  if (!/^\d{1,2}:\d{2}$/.test(startTime)) {
    return NextResponse.json({ error: 'startTime debe ser HH:mm' }, { status: 400 })
  }

  const durationMinutes = Math.max(30, Math.min(240, Number(body.durationMinutes) || 90))
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null
  const location = typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null

  const row = await prisma.teamSchedule.create({
    data: {
      teamId: parsedTeamId,
      weekday,
      startTime,
      durationMinutes,
      title,
      location,
    },
  })

  void runTeamScheduleChangedWorkflows(parsedTeamId).catch((err) => {
    console.warn('[schedules] WD-2 workflow failed:', err)
  })

  return NextResponse.json({
    schedule: {
      id: row.id,
      weekday: row.weekday,
      startTime: row.startTime,
      durationMinutes: row.durationMinutes,
      title: row.title,
      location: row.location,
    },
  })
}

import { NextResponse } from 'next/server'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'
import { generateTeamSessionsFromSchedule } from '@/lib/team-calendar'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id: teamId } = await params
  const parsedTeamId = parseCuid(teamId, 'teamId')
  if (parsedTeamId instanceof Response) return parsedTeamId

  try {
    const result = await generateTeamSessionsFromSchedule({
      teamId: parsedTeamId,
      regenerate: true,
      untilSeasonEnd: true,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error al generar calendario'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

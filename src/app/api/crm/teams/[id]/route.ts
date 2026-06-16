import { NextResponse } from 'next/server'
import { updateTeam } from '@/app/actions/teams'
import { parseCuid } from '@/lib/db-input-validation'
import { assertTeamAccess, requireRoles } from '@/lib/rbac-api'
import { parseDateInput } from '@/lib/team-calendar'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  const denied = await assertTeamAccess(auth, parsedId)
  if (denied) return denied
  let body: {
    name?: string
    category?: string | null
    seasonStartDate?: string | null
    seasonEndDate?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = body.name !== undefined ? String(body.name).trim() : undefined
  const category =
    body.category === null || body.category === ''
      ? null
      : body.category !== undefined
        ? String(body.category).trim() || null
        : undefined

  if (name !== undefined && name === '') {
    return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 })
  }

  let seasonStartDate: Date | null | undefined
  let seasonEndDate: Date | null | undefined

  if (body.seasonStartDate !== undefined) {
    if (body.seasonStartDate === null || body.seasonStartDate === '') {
      seasonStartDate = null
    } else {
      seasonStartDate = parseDateInput(String(body.seasonStartDate))
      if (!seasonStartDate) {
        return NextResponse.json({ error: 'seasonStartDate no válida' }, { status: 400 })
      }
    }
  }

  if (body.seasonEndDate !== undefined) {
    if (body.seasonEndDate === null || body.seasonEndDate === '') {
      seasonEndDate = null
    } else {
      seasonEndDate = parseDateInput(String(body.seasonEndDate))
      if (!seasonEndDate) {
        return NextResponse.json({ error: 'seasonEndDate no válida' }, { status: 400 })
      }
    }
  }

  const payload: {
    name?: string
    category?: string | null
    seasonStartDate?: Date | null
    seasonEndDate?: Date | null
  } = {}
  if (name !== undefined) payload.name = name
  if (category !== undefined) payload.category = category
  if (seasonStartDate !== undefined) payload.seasonStartDate = seasonStartDate
  if (seasonEndDate !== undefined) payload.seasonEndDate = seasonEndDate

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'Sin datos para actualizar' }, { status: 400 })
  }

  await updateTeam(parsedId, payload)

  return NextResponse.json({ ok: true })
}

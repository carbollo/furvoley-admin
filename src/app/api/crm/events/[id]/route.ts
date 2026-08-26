import { NextResponse } from 'next/server'
import { updateEventInternal } from '@/lib/events-service'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

type Params = { params: Promise<{ id: string }> }

async function assertCanManageEvent(eventId: string, role: string, memberId: string | null) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { groupId: true },
  })
  if (!event) {
    return { ok: false as const, response: NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 }) }
  }
  if (role === 'COACH') {
    if (!memberId || !event.groupId) {
      return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    const coachTeam = await prisma.groupMembership.findFirst({
      where: { memberId, groupId: event.groupId, role: 'COACH' },
      select: { id: true },
    })
    if (!coachTeam) {
      return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
  }
  return { ok: true as const, event }
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  const sessionUser = auth.session.user as { memberId?: string | null }
  const access = await assertCanManageEvent(parsedId, auth.role, sessionUser.memberId ?? null)
  if (!access.ok) return access.response

  let body: {
    title?: string
    type?: string
    date?: string
    location?: string
    description?: string
    groupId?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const title = body.title !== undefined ? String(body.title).trim() : undefined
  const groupId = body.groupId !== undefined ? String(body.groupId).trim() : undefined
  if (title === '') {
    return NextResponse.json({ error: 'El título no puede quedar vacío' }, { status: 400 })
  }
  if (groupId === '') {
    return NextResponse.json({ error: 'El equipo es obligatorio' }, { status: 400 })
  }

  if (auth.role === 'COACH' && groupId) {
    const memberId = sessionUser.memberId ?? null
    if (!memberId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const coachTeam = await prisma.groupMembership.findFirst({
      where: { memberId, groupId, role: 'COACH' },
      select: { id: true },
    })
    if (!coachTeam) {
      return NextResponse.json({ error: 'No puedes asignar ese equipo' }, { status: 403 })
    }
  }

  let date: Date | undefined
  if (body.date !== undefined) {
    date = new Date(body.date)
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
    }
  }

  const payload: {
    title?: string
    type?: string
    date?: Date
    location?: string
    description?: string
    groupId?: string
  } = {}
  if (title !== undefined) payload.title = title
  if (body.type !== undefined) payload.type = body.type.trim() || 'OTHER'
  if (date !== undefined) payload.date = date
  if (body.location !== undefined) payload.location = body.location.trim() || undefined
  if (body.description !== undefined) payload.description = body.description.trim() || undefined
  if (groupId !== undefined) payload.groupId = groupId

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'Sin datos para actualizar' }, { status: 400 })
  }

  await updateEventInternal(parsedId, payload)
  return NextResponse.json({ ok: true })
}

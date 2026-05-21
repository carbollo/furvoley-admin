import { NextResponse } from 'next/server'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { runConvocationPublishedWorkflows } from '@/lib/workflow-proclub-runners'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id: eventId } = await params
  const parsedEventId = parseCuid(eventId, 'eventId')
  if (parsedEventId instanceof Response) return parsedEventId
  let body: { memberIds?: string[]; audience?: 'INVITED' | 'NOT_CALLED' } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const event = await prisma.event.findUnique({ where: { id: parsedEventId }, select: { teamId: true } })
  if (!event?.teamId) {
    return NextResponse.json({ error: 'Evento sin equipo' }, { status: 400 })
  }

  const memberIds =
    body.memberIds ??
    (
      await prisma.teamMember.findMany({
        where: { teamId: event.teamId, role: 'PLAYER' },
        select: { memberId: true },
      })
    ).map((m) => m.memberId)

  const audience = body.audience === 'NOT_CALLED' ? 'NOT_CALLED' : 'INVITED'

  if (audience === 'INVITED') {
    for (const memberId of memberIds) {
      await prisma.eventConvocation.upsert({
        where: { eventId_memberId: { eventId: parsedEventId, memberId } },
        create: { eventId: parsedEventId, memberId, status: 'INVITED' },
        update: { status: 'INVITED' },
      })
    }
    const allPlayers = await prisma.teamMember.findMany({
      where: { teamId: event.teamId, role: 'PLAYER' },
      select: { memberId: true },
    })
    for (const p of allPlayers) {
      if (!memberIds.includes(p.memberId)) {
        await prisma.eventConvocation.upsert({
          where: { eventId_memberId: { eventId: parsedEventId, memberId: p.memberId } },
          create: { eventId: parsedEventId, memberId: p.memberId, status: 'NOT_CALLED' },
          update: { status: 'NOT_CALLED' },
        })
      }
    }
  }

  void runConvocationPublishedWorkflows(parsedEventId, audience).catch((e) => {
    console.warn('[convocation] workflow failed:', e)
  })

  return NextResponse.json({ ok: true, count: memberIds.length, audience })
}

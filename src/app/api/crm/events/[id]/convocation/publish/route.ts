import { NextResponse } from 'next/server'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { getEffectiveGroupMembers } from '@/lib/groups'
import { runConvocationPublishedWorkflows } from '@/lib/workflow-proclub-runners'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
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

  const event = await prisma.event.findUnique({ where: { id: parsedEventId }, select: { groupId: true } })
  if (!event?.groupId) {
    return NextResponse.json({ error: 'Evento sin equipo' }, { status: 400 })
  }

  // Jugadores EFECTIVOS del grupo (directos + los de sus subgrupos, por contención).
  const effectivePlayerIds = (await getEffectiveGroupMembers(event.groupId))
    .filter((m) => m.role === 'PLAYER')
    .map((m) => m.memberId)

  const memberIds = body.memberIds ?? effectivePlayerIds

  const audience = body.audience === 'NOT_CALLED' ? 'NOT_CALLED' : 'INVITED'

  if (audience === 'INVITED') {
    for (const memberId of memberIds) {
      await prisma.eventConvocation.upsert({
        where: { eventId_memberId: { eventId: parsedEventId, memberId } },
        create: { eventId: parsedEventId, memberId, status: 'INVITED' },
        update: { status: 'INVITED' },
      })
    }
    for (const playerId of effectivePlayerIds) {
      if (!memberIds.includes(playerId)) {
        await prisma.eventConvocation.upsert({
          where: { eventId_memberId: { eventId: parsedEventId, memberId: playerId } },
          create: { eventId: parsedEventId, memberId: playerId, status: 'NOT_CALLED' },
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

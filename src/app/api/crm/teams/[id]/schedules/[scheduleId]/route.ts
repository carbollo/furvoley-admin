import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

type Params = { params: Promise<{ id: string; scheduleId: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id: teamId, scheduleId } = await params
  try {
    await prisma.teamSchedule.deleteMany({
      where: { id: scheduleId, teamId },
    })
  } catch {
    return NextResponse.json({ error: 'Horario no encontrado' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

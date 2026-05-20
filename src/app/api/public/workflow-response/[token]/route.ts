import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  consumeWorkflowResponseToken,
  markWorkflowResponseTokenUsed,
} from '@/lib/workflow-response-links'
import { updateAttendance } from '@/app/actions/events'

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  const consumed = await consumeWorkflowResponseToken(token)
  if (!consumed.ok) {
    return NextResponse.json({ error: consumed.error }, { status: 400 })
  }

  const row = consumed.row
  let event = null
  let attendances: Array<{ id: string; memberName: string; status: string }> = []

  if (row.eventId) {
    event = await prisma.event.findUnique({
      where: { id: row.eventId },
      select: { id: true, title: true, date: true, location: true, teamId: true },
    })
    const rows = await prisma.attendance.findMany({
      where: { eventId: row.eventId },
      include: { member: { select: { name: true } } },
    })
    attendances = rows.map((a) => ({
      id: a.id,
      memberName: a.member.name,
      status: a.status,
    }))
  }

  return NextResponse.json({
    type: row.type,
    event,
    attendances,
    memberId: row.memberId,
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  const consumed = await consumeWorkflowResponseToken(token)
  if (!consumed.ok) {
    return NextResponse.json({ error: consumed.error }, { status: 400 })
  }

  const row = consumed.row
  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (row.type === 'ATTENDANCE' || row.type === 'ATTENDANCE_REASON') {
    const attendanceId = String(body.attendanceId || '')
    const status = String(body.status || 'PRESENT')
    const reason = typeof body.reason === 'string' ? body.reason : undefined
    if (!attendanceId) {
      return NextResponse.json({ error: 'attendanceId requerido' }, { status: 400 })
    }
    await updateAttendance(attendanceId, status, reason)
    await markWorkflowResponseTokenUsed(token)
    return NextResponse.json({ ok: true })
  }

  if (row.type === 'CONVOCATION') {
    const answer = String(body.answer || '')
    if (!row.memberId || !row.eventId) {
      return NextResponse.json({ error: 'Token incompleto' }, { status: 400 })
    }
    const status = answer === 'no' ? 'DECLINED' : 'CONFIRMED'
    await prisma.eventConvocation.upsert({
      where: { eventId_memberId: { eventId: row.eventId, memberId: row.memberId } },
      create: { eventId: row.eventId, memberId: row.memberId, status },
      update: { status },
    })
    await markWorkflowResponseTokenUsed(token)
    return NextResponse.json({ ok: true })
  }

  if (row.type === 'TRIAL') {
    await markWorkflowResponseTokenUsed(token)
    return NextResponse.json({ ok: true, message: 'Confirmación registrada' })
  }

  if (row.type === 'LEAVE_SURVEY') {
    await markWorkflowResponseTokenUsed(token)
    return NextResponse.json({ ok: true })
  }

  await markWorkflowResponseTokenUsed(token)
  return NextResponse.json({ ok: true })
}

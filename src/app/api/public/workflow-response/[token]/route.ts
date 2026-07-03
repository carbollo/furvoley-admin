import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  consumeWorkflowResponseToken,
  getWorkflowResponseToken,
  markWorkflowResponseTokenUsed,
} from '@/lib/workflow-response-links'
import { updateAttendance } from '@/app/actions/events'

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  const peek = await getWorkflowResponseToken(token)
  if (!peek.ok) {
    return NextResponse.json({ error: peek.error }, { status: 400 })
  }

  const row = peek.row
  let prefill: { name?: string; email?: string; phone?: string } | null = null
  if (row.memberId) {
    const member = await prisma.member.findUnique({
      where: { id: row.memberId },
      select: { name: true, email: true, phone: true, guardianPhone: true },
    })
    if (member) {
      prefill = {
        name: member.name,
        email: member.email ?? undefined,
        phone: member.phone ?? member.guardianPhone ?? undefined,
      }
    }
  }

  if (row.type === 'LEAVE_SURVEY') {
    return NextResponse.json({
      type: row.type,
      used: peek.used,
      prefill,
    })
  }

  if (peek.used) {
    return NextResponse.json({ error: 'Enlace ya utilizado' }, { status: 400 })
  }

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
    // La fila de asistencia debe pertenecer al evento del enlace (evita usar
    // un token de un evento para tocar asistencias de otro).
    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      select: { eventId: true },
    })
    if (!attendance || (row.eventId && attendance.eventId !== row.eventId)) {
      return NextResponse.json({ error: 'Asistencia no válida para este enlace' }, { status: 400 })
    }
    await updateAttendance(attendanceId, status, reason)
    // La checklist es multi-uso (un toque por jugador, correcciones incluidas):
    // no se consume; caduca sola a los 7 días. El motivo de ausencia sí es de un solo uso.
    if (row.type === 'ATTENDANCE_REASON') {
      await markWorkflowResponseTokenUsed(token)
    }
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
    const name = String(body.name || '').trim()
    const reason = String(body.reason || '').trim()
    if (!name || !reason) {
      return NextResponse.json({ error: 'Nombre y motivo son obligatorios' }, { status: 400 })
    }
    const survey = {
      name,
      email: typeof body.email === 'string' ? body.email.trim() : '',
      phone: typeof body.phone === 'string' ? body.phone.trim() : '',
      reason,
      reasonLabel: String(body.reasonLabel || reason),
      comments: typeof body.comments === 'string' ? body.comments.trim() : '',
      submittedAt: new Date().toISOString(),
    }
    const prevPayload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {}
    await prisma.workflowResponseToken.update({
      where: { token },
      data: {
        usedAt: new Date(),
        payload: { ...prevPayload, survey } as object,
      },
    })
    if (row.memberId) {
      const member = await prisma.member.findUnique({
        where: { id: row.memberId },
        select: { email: true, phone: true },
      })
      if (member) {
        await prisma.member.update({
          where: { id: row.memberId },
          data: {
            email: member.email?.trim() ? member.email : survey.email || undefined,
            phone: member.phone?.trim() ? member.phone : survey.phone || undefined,
          },
        })
      }
    }
    return NextResponse.json({ ok: true })
  }

  await markWorkflowResponseTokenUsed(token)
  return NextResponse.json({ ok: true })
}

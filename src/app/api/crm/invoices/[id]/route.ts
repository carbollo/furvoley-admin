import { NextResponse } from 'next/server'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

/** Reprogramar cobro (roadmap · Impagos): mover la fecha de vencimiento. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  let body: { dueDate?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const dueDate = new Date(String(body.dueDate || ''))
  if (Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: 'Fecha de vencimiento no válida' }, { status: 400 })
  }

  const existing = await prisma.invoice.findUnique({
    where: { id: parsedId },
    select: { id: true, status: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Cobro no encontrado' }, { status: 404 })
  }
  if (existing.status === 'PAID' || existing.status === 'VOID') {
    return NextResponse.json({ error: 'La factura ya está cerrada' }, { status: 400 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  await prisma.invoice.update({
    where: { id: parsedId },
    data: {
      dueDate,
      // Si se reprograma hacia el futuro, deja de estar vencida.
      ...(existing.status === 'OVERDUE' && dueDate >= today ? { status: 'PENDING' } : {}),
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], _request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId
  const existing = await prisma.invoice.findUnique({
    where: { id: parsedId },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Cobro no encontrado' }, { status: 404 })
  }

  await prisma.$transaction([
    prisma.journalLine.deleteMany({
      where: {
        entry: { sourceId: parsedId },
      },
    }),
    prisma.journalEntry.deleteMany({
      where: { sourceId: parsedId },
    }),
    prisma.transaction.deleteMany({ where: { invoiceId: parsedId } }),
    prisma.invoice.delete({ where: { id: parsedId } }),
  ])

  return NextResponse.json({ ok: true })
}

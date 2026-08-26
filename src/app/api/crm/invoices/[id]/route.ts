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
    select: { id: true, paidAmount: true, invoiceNumber: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Cobro no encontrado' }, { status: 404 })
  }

  // Borrar una factura arrastra su ingreso y su asiento contable. Si ya se cobró
  // algo, eso significa hacer desaparecer dinero que entró de verdad y descuadrar
  // la contabilidad del club sin dejar rastro. Una factura cobrada se anula, no
  // se borra.
  if (existing.paidAmount > 0) {
    return NextResponse.json(
      {
        error:
          `La factura ${existing.invoiceNumber} ya tiene cobros registrados y no se puede eliminar: ` +
          `se perdería ese ingreso de la contabilidad. Si es un error, corrige primero el cobro.`,
      },
      { status: 409 },
    )
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

import { NextResponse } from 'next/server'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
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

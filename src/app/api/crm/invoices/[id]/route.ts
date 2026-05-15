import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const existing = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Cobro no encontrado' }, { status: 404 })
  }

  await prisma.$transaction([
    prisma.journalLine.deleteMany({
      where: {
        entry: { sourceId: id },
      },
    }),
    prisma.journalEntry.deleteMany({
      where: { sourceId: id },
    }),
    prisma.transaction.deleteMany({ where: { invoiceId: id } }),
    prisma.invoice.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true })
}

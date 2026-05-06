import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const existing = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Cobro no encontrado' }, { status: 404 })
  }

  const postedEntries = await prisma.journalEntry.count({
    where: {
      sourceId: id,
      status: { in: ['POSTED', 'REVERSED'] },
    },
  })
  if (postedEntries > 0) {
    return NextResponse.json(
      { error: 'No se puede borrar: el cobro está contabilizado. Revierte el asiento y anula el documento.' },
      { status: 409 },
    )
  }

  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { invoiceId: id } }),
    prisma.invoice.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true })
}

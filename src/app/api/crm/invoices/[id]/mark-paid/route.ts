import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordManualInvoicePayment } from '@/app/actions/billing'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const invoice = await prisma.invoice.findUnique({ where: { id } })
  if (!invoice) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const pending = Math.max(0, invoice.totalAmount - invoice.paidAmount)
  if (pending <= 0) {
    return NextResponse.json({ error: 'Ya pagada' }, { status: 400 })
  }

  await recordManualInvoicePayment({
    invoiceId: id,
    amount: pending,
    method: 'CASH',
  })

  return NextResponse.json({ ok: true })
}

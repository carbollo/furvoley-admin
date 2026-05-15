import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordManualInvoicePayment } from '@/app/actions/billing'
import { requireRoles } from '@/lib/rbac-api'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

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

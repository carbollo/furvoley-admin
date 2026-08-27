import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'
import { recordManualInvoicePayment } from '@/app/actions/billing'

export const dynamic = 'force-dynamic'

/**
 * «Cobrado en mano»: registra el pago en efectivo de la factura de alta.
 *
 * El botón anterior solo marcaba la cuota como activa. La factura seguía
 * pendiente, así que el socio continuaba en Impagos y recibía recordatorios
 * reclamándole un dinero que ya había entregado. Registrando el cobro de
 * verdad, la lógica de facturación activa la cuota y al socio por sí sola.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  const subscription = await prisma.subscription.findUnique({
    where: { id: parsedId },
    select: { id: true, memberId: true },
  })
  if (!subscription) {
    return NextResponse.json({ error: 'Esa cuota ya no existe.' }, { status: 404 })
  }

  // La factura de alta es la más antigua de esta suscripción que siga abierta.
  const invoice = await prisma.invoice.findFirst({
    where: { subscriptionId: parsedId, status: { notIn: ['PAID', 'VOID'] } },
    orderBy: { issueDate: 'asc' },
    select: { id: true, totalAmount: true, paidAmount: true, invoiceNumber: true },
  })
  if (!invoice) {
    return NextResponse.json(
      { error: 'Esta cuota no tiene ninguna factura pendiente que cobrar.' },
      { status: 409 },
    )
  }

  const pendiente = Math.max(0, invoice.totalAmount - invoice.paidAmount)
  if (pendiente <= 0) {
    return NextResponse.json(
      { error: `La factura ${invoice.invoiceNumber} ya está cobrada.` },
      { status: 409 },
    )
  }

  await recordManualInvoicePayment({
    invoiceId: invoice.id,
    amount: pendiente,
    method: 'CASH',
    bankReference: null,
  })

  return NextResponse.json({ ok: true, invoiceNumber: invoice.invoiceNumber, amount: pendiente })
}

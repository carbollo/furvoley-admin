import { NextResponse } from 'next/server'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { recordManualInvoicePayment } from '@/app/actions/billing'
import { requireRoles } from '@/lib/rbac-api'

const METODOS = ['CASH', 'BANK_TRANSFER'] as const
type Metodo = (typeof METODOS)[number]

/**
 * Registra un cobro sobre una factura.
 *
 * Antes solo sabía hacer una cosa: dar por cobrado TODO el pendiente, en
 * efectivo y con fecha de hoy. Si el socio pagaba la mitad, o pagaba por
 * transferencia, el tesorero no tenía forma de reflejarlo y la contabilidad
 * quedaba con el método equivocado.
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
  const invoice = await prisma.invoice.findUnique({ where: { id: parsedId } })
  if (!invoice) {
    return NextResponse.json({ error: 'Esa factura ya no existe.' }, { status: 404 })
  }

  const pending = Math.max(0, invoice.totalAmount - invoice.paidAmount)
  if (pending <= 0) {
    return NextResponse.json(
      { error: `La factura ${invoice.invoiceNumber} ya está cobrada.` },
      { status: 409 },
    )
  }

  let body: { amount?: unknown; method?: unknown; bankReference?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    /* sin cuerpo: se cobra todo el pendiente en efectivo, como antes */
  }

  let amount = pending
  if (body.amount !== undefined) {
    const n = Number(body.amount)
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: 'El importe no es válido.' }, { status: 400 })
    }
    // Cobrar de más dejaría la factura con saldo a favor y descuadraría la
    // contabilidad: se rechaza en vez de aceptarlo en silencio.
    if (n > pending + 0.005) {
      return NextResponse.json(
        { error: `No puedes cobrar más de lo que se debe (${pending.toFixed(2)}).` },
        { status: 400 },
      )
    }
    amount = Number(n.toFixed(2))
  }

  const raw = String(body.method || 'CASH').toUpperCase()
  if (!METODOS.includes(raw as Metodo)) {
    return NextResponse.json({ error: 'Forma de cobro no válida.' }, { status: 400 })
  }

  await recordManualInvoicePayment({
    invoiceId: parsedId,
    amount,
    method: raw as Metodo,
    bankReference:
      typeof body.bankReference === 'string' && body.bankReference.trim()
        ? body.bankReference.trim().slice(0, 200)
        : null,
  })

  const after = await prisma.invoice.findUnique({
    where: { id: parsedId },
    select: { totalAmount: true, paidAmount: true, status: true },
  })
  return NextResponse.json({
    ok: true,
    amount,
    pending: Math.max(0, (after?.totalAmount ?? 0) - (after?.paidAmount ?? 0)),
    status: after?.status ?? 'PENDING',
  })
}

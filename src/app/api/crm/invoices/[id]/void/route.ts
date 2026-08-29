import { NextResponse } from 'next/server'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { createJournalEntry, reverseJournalEntry } from '@/lib/accounting/engine'
import { ensureBasePgcAccounts } from '@/lib/accounting/pgc'
import { nextInvoiceNumber } from '@/lib/crm-invoice-create'

export const dynamic = 'force-dynamic'

/**
 * Anular una factura.
 *
 * Hasta ahora esto no existía, y era un agujero incómodo: varios mensajes de
 * error del propio CRM mandaban a «anúlala y emite otra», y no había ningún
 * sitio donde hacerlo. Una factura equivocada se quedaba viva para siempre,
 * contando en la deuda del club, apareciendo en Impagos y generándole
 * recordatorios automáticos al socio.
 *
 * Dos formas, según lo que haya pasado con el documento:
 *
 * - `simple`: la factura no ha salido del club ni tiene cobros. Se marca
 *   anulada y se revierte su asiento de emisión. Es lo que hace cualquiera
 *   cuando se equivoca al teclear y lo ve al momento.
 *
 * - `rectificativa`: la factura ya está en manos del socio o ya se cobró. La
 *   original NO se toca —eso es lo que exige Hacienda— y se emite una factura
 *   de abono que la compensa, con su propio número y su propio asiento
 *   invertido. Las dos quedan en el libro, que es como debe ser.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  let body: { modo?: unknown; motivo?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const modo = String(body.modo || '').toLowerCase()
  if (modo !== 'simple' && modo !== 'rectificativa') {
    return NextResponse.json({ error: 'Indica si es una anulación simple o una rectificativa.' }, { status: 400 })
  }
  const motivo = String(body.motivo || '').trim().slice(0, 300)
  if (!motivo) {
    return NextResponse.json({ error: 'Explica por qué se anula: queda en el libro.' }, { status: 400 })
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: parsedId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      memberId: true,
      subtotal: true,
      taxAmount: true,
      withholdingAmount: true,
      totalAmount: true,
      currency: true,
      paidAmount: true,
    },
  })
  if (!invoice) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
  if (invoice.status === 'VOID') {
    return NextResponse.json({ error: 'Esa factura ya está anulada.' }, { status: 409 })
  }

  if (modo === 'simple' && invoice.paidAmount > 0) {
    return NextResponse.json(
      {
        error:
          `La factura ${invoice.invoiceNumber} ya tiene cobros registrados, así que no se puede anular sin más: ` +
          'emite una rectificativa, que deja constancia de las dos.',
      },
      { status: 409 },
    )
  }

  const asientoEmision = await prisma.journalEntry.findFirst({
    where: { source: 'INVOICE_ISSUED', sourceId: invoice.id, status: 'POSTED' },
    select: { id: true },
  })

  if (modo === 'simple') {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'VOID', notes: `ANULADA: ${motivo}` },
    })
    if (asientoEmision) {
      await reverseJournalEntry(asientoEmision.id, `Anulación de ${invoice.invoiceNumber}: ${motivo}`)
    }
    return NextResponse.json({ ok: true, modo, invoiceNumber: invoice.invoiceNumber })
  }

  // Rectificativa: nace una factura de abono, con los importes en negativo, que
  // compensa a la original. La original se queda tal cual.
  await ensureBasePgcAccounts()
  const numero = await nextInvoiceNumber()
  const abono = await prisma.invoice.create({
    data: {
      invoiceNumber: numero,
      kind: 'CREDIT_NOTE',
      issueDate: new Date(),
      dueDate: new Date(),
      subtotal: -invoice.subtotal,
      taxAmount: -invoice.taxAmount,
      withholdingAmount: -invoice.withholdingAmount,
      totalAmount: -invoice.totalAmount,
      paidAmount: -invoice.paidAmount,
      status: 'PAID',
      currency: invoice.currency,
      memberId: invoice.memberId,
      notes: `Rectifica a ${invoice.invoiceNumber}: ${motivo}`,
      items: {
        create: [
          {
            description: `Abono de la factura ${invoice.invoiceNumber} — ${motivo}`,
            quantity: 1,
            unitAmount: -invoice.subtotal,
            totalAmount: -invoice.subtotal,
          },
        ],
      },
    },
  })

  // Su asiento, que es el de emisión con los lados cambiados.
  const lineas: Parameters<typeof createJournalEntry>[0]['lines'] = [
    {
      accountCode: '4300000',
      side: 'CREDIT',
      amount: invoice.totalAmount,
      lineConcept: 'Anulación del derecho de cobro',
      memberId: invoice.memberId,
    },
  ]
  if (invoice.withholdingAmount > 0) {
    lineas.push({
      accountCode: '4730000',
      side: 'CREDIT',
      amount: invoice.withholdingAmount,
      lineConcept: 'Retención rectificada',
      memberId: invoice.memberId,
    })
  }
  lineas.push({
    accountCode: '7050000',
    side: 'DEBIT',
    amount: invoice.subtotal,
    lineConcept: 'Rectificación de ingreso',
    memberId: invoice.memberId,
  })
  if (invoice.taxAmount > 0) {
    lineas.push({
      accountCode: '4770000',
      side: 'DEBIT',
      amount: invoice.taxAmount,
      lineConcept: 'IVA repercutido rectificado',
      memberId: invoice.memberId,
    })
  }

  try {
    await createJournalEntry({
      concept: `Rectificativa ${numero} de ${invoice.invoiceNumber}`,
      entryDate: new Date(),
      source: 'INVOICE_ISSUED',
      sourceId: abono.id,
      lines: lineas,
    })
  } catch (e) {
    // Sin asiento no hay rectificativa: se deshace para no dejar un documento
    // fiscal suelto que la contabilidad no recoge.
    await prisma.invoice.delete({ where: { id: abono.id } }).catch(() => {})
    return NextResponse.json(
      {
        error:
          e instanceof Error && /periodo cerrado/i.test(e.message)
            ? 'El periodo contable está cerrado. Reábrelo en Contabilidad → Periodos y vuelve a intentarlo.'
            : 'No se pudo contabilizar la rectificativa, así que no se ha emitido.',
      },
      { status: 409 },
    )
  }

  // La original queda saldada por la rectificativa: deja de reclamarse.
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: 'VOID', notes: `Rectificada por ${numero}: ${motivo}` },
  })

  return NextResponse.json({ ok: true, modo, rectificativa: numero, invoiceNumber: invoice.invoiceNumber })
}

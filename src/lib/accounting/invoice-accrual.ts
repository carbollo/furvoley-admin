import { prisma } from '@/lib/prisma'
import { createJournalEntry } from '@/lib/accounting/engine'
import { ensureBasePgcAccounts } from '@/lib/accounting/pgc'

/**
 * El asiento de EMISIÓN de una factura (devengo).
 *
 * Hasta ahora el CRM solo asentaba el cobro —DEBE tesorería / HABER clientes—,
 * y nadie escribía nunca la otra mitad. Consecuencias que veía el tesorero:
 * «Resultado del año: 0 €» habiendo facturado treinta mil, las cuotas sin
 * aparecer en la cuenta de pérdidas y ganancias, y la cuenta de Clientes con
 * saldo NEGATIVO en el balance, porque solo se abonaba y jamás se cargaba.
 *
 * El asiento correcto al emitir es:
 *
 *   DEBE   4300000  Clientes ................ total (lo que el socio nos debe)
 *   DEBE   4730000  HP retenciones .......... retención, si la hay
 *   HABER  7050000  Prestaciones de servicios base
 *   HABER  4770000  HP IVA repercutido ...... IVA, si lo hay
 *
 * Y el cobro, que ya existía, lo salda: DEBE tesorería / HABER clientes.
 *
 * Es idempotente: se identifica por `source` + `sourceId`, así que reemitir o
 * reintentar no duplica el apunte. Importa porque esto se llama desde tres
 * sitios distintos que crean facturas.
 */
export async function postInvoiceAccrual(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      issueDate: true,
      memberId: true,
      status: true,
      subtotal: true,
      taxAmount: true,
      withholdingAmount: true,
      totalAmount: true,
    },
  })
  if (!invoice) return
  // Una factura anulada no devenga nada.
  if (invoice.status === 'VOID') return
  // Sin importe no hay nada que asentar (una beca al 100 %, por ejemplo).
  if (invoice.subtotal <= 0 && invoice.totalAmount <= 0) return

  const yaEsta = await prisma.journalEntry.findFirst({
    where: { source: 'INVOICE_ISSUED', sourceId: invoice.id },
    select: { id: true },
  })
  if (yaEsta) return

  await ensureBasePgcAccounts()

  const lineas: Parameters<typeof createJournalEntry>[0]['lines'] = [
    {
      accountCode: '4300000',
      side: 'DEBIT',
      amount: invoice.totalAmount,
      lineConcept: 'Derecho de cobro',
      memberId: invoice.memberId,
    },
  ]
  if (invoice.withholdingAmount > 0) {
    lineas.push({
      accountCode: '4730000',
      side: 'DEBIT',
      amount: invoice.withholdingAmount,
      lineConcept: 'Retención practicada',
      memberId: invoice.memberId,
    })
  }
  lineas.push({
    accountCode: '7050000',
    side: 'CREDIT',
    amount: invoice.subtotal,
    lineConcept: 'Cuotas y servicios',
    memberId: invoice.memberId,
  })
  if (invoice.taxAmount > 0) {
    lineas.push({
      accountCode: '4770000',
      side: 'CREDIT',
      amount: invoice.taxAmount,
      lineConcept: 'IVA repercutido',
      memberId: invoice.memberId,
    })
  }

  await createJournalEntry({
    concept: `Factura ${invoice.invoiceNumber}`,
    entryDate: invoice.issueDate,
    source: 'INVOICE_ISSUED',
    sourceId: invoice.id,
    lines: lineas,
  })
}

/**
 * Emitir no puede fallar porque la contabilidad se queje.
 *
 * Si el periodo está cerrado o el asiento no cuadra, la factura tiene que
 * existir igual —el socio la necesita— y el problema se registra para que
 * alguien lo mire. Lo contrario sería que el club no pudiera facturar por
 * tener un mes cerrado.
 */
export async function postInvoiceAccrualSafe(invoiceId: string): Promise<void> {
  try {
    await postInvoiceAccrual(invoiceId)
  } catch (e) {
    console.error(
      '[contabilidad] no se pudo asentar la emisión de la factura',
      invoiceId,
      e instanceof Error ? e.message : e,
    )
  }
}

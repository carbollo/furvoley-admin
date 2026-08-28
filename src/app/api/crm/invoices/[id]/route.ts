import { NextResponse } from 'next/server'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

/**
 * Corregir una factura: vencimiento, concepto e importe.
 *
 * Una errata en el concepto obligaba a ELIMINAR la factura y volver a emitirla
 * con otro número, dejando un hueco en la numeración de un documento contable.
 * Mientras no se haya cobrado nada, corregirla es seguro: no hay ningún ingreso
 * ni asiento que dependa de sus cifras.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  let body: { dueDate?: string; concepto?: string; amount?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const existing = await prisma.invoice.findUnique({
    where: { id: parsedId },
    select: {
      id: true,
      status: true,
      dueDate: true,
      paidAmount: true,
      invoiceNumber: true,
      subtotal: true,
      taxAmount: true,
      totalAmount: true,
      // TODAS las líneas, no solo la primera: hace falta saber cuántas hay para
      // no reescribir una sola y dejar el desglose sin sumar el total.
      items: { orderBy: { id: 'asc' }, select: { id: true } },
    },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
  }
  if (existing.status === 'PAID' || existing.status === 'VOID') {
    return NextResponse.json({ error: 'La factura ya está cerrada' }, { status: 400 })
  }

  let dueDate = existing.dueDate
  if (body.dueDate !== undefined) {
    const d = new Date(String(body.dueDate || ''))
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Fecha de vencimiento no válida' }, { status: 400 })
    }
    dueDate = d
  }

  const cambiaConcepto = typeof body.concepto === 'string'
  const cambiaImporte = body.amount !== undefined

  // En cuanto hay un cobro registrado, cambiar el importe descuadraría lo ya
  // contabilizado. La fecha sí se puede seguir moviendo.
  if ((cambiaConcepto || cambiaImporte) && existing.paidAmount > 0) {
    return NextResponse.json(
      {
        error: `La factura ${existing.invoiceNumber} ya tiene cobros registrados: solo puedes cambiar la fecha de vencimiento.`,
      },
      { status: 409 },
    )
  }

  // El importe que llega es la BASE IMPONIBLE, y de ella se recalculan impuesto
  // y total con los tipos que YA tenía este documento. Antes se escribía el
  // número recibido en `subtotal` y en `totalAmount` sin tocar `taxAmount`: como
  // el formulario venía relleno con el TOTAL, corregir una errata del concepto
  // subía la base de 100 a 121 y dejaba un IVA de 21 que ya no cuadraba con
  // nada. La lista, que deduce la retención como subtotal+IVA-total, se
  // inventaba además una retención de 21 € que nunca existió.
  //
  // Los tipos se sacan del propio documento y no de la configuración actual del
  // club: si el club cambia el IVA, una factura vieja no puede reprecificarse
  // sola al corregirle una palabra.
  let nuevaBase: number | null = null
  let nuevoIva = existing.taxAmount
  let nuevoTotal = existing.totalAmount
  if (cambiaImporte) {
    if (existing.items.length > 1) {
      return NextResponse.json(
        {
          error:
            `La factura ${existing.invoiceNumber} tiene varias líneas (por ejemplo matrícula y cuota). ` +
            'Cambiar el importe dejaría el desglose sin cuadrar: anúlala y emite otra.',
        },
        { status: 409 },
      )
    }
    const n = Number(body.amount)
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: 'El importe no es válido.' }, { status: 400 })
    }
    nuevaBase = Number(n.toFixed(2))

    const tipoIva = existing.subtotal > 0 ? existing.taxAmount / existing.subtotal : 0
    const retencion = Math.max(0, existing.subtotal + existing.taxAmount - existing.totalAmount)
    const tipoRet = existing.subtotal > 0 ? retencion / existing.subtotal : 0
    nuevoIva = Number((nuevaBase * tipoIva).toFixed(2))
    nuevoTotal = Number((nuevaBase + nuevoIva - nuevaBase * tipoRet).toFixed(2))
  }
  const nuevoImporte = nuevaBase

  const concepto = cambiaConcepto ? String(body.concepto).trim().slice(0, 300) : null
  if (cambiaConcepto && !concepto) {
    return NextResponse.json({ error: 'El concepto no puede quedar vacío.' }, { status: 400 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const itemId = existing.items[0]?.id

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: parsedId },
      data: {
        dueDate,
        ...(nuevoImporte !== null
          ? { subtotal: nuevoImporte, taxAmount: nuevoIva, totalAmount: nuevoTotal }
          : {}),
        // Si se reprograma hacia el futuro, deja de estar vencida.
        ...(existing.status === 'OVERDUE' && dueDate >= today ? { status: 'PENDING' } : {}),
        // El enlace de pago cacheado cobraría el importe viejo.
        ...(nuevoImporte !== null
          ? { whopCheckoutUrl: null, whopCheckoutId: null, whopCheckoutAmount: null }
          : {}),
      },
    }),
    ...(itemId && (concepto || nuevoImporte !== null)
      ? [
          prisma.invoiceItem.update({
            where: { id: itemId },
            data: {
              ...(concepto ? { description: concepto } : {}),
              ...(nuevoImporte !== null
                ? { unitAmount: nuevoImporte, totalAmount: nuevoImporte, quantity: 1 }
                : {}),
            },
          }),
        ]
      : []),
  ])

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
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
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

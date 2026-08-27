import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { crmInvoiceEstado } from '@/lib/invoice-display'
import { createMemberInvoice, createTeamInvoices } from '@/lib/crm-invoice-create'

export const dynamic = 'force-dynamic'

const POR_PAGINA = 50

/**
 * Listado de facturas paginado y filtrado EN EL SERVIDOR.
 *
 * La pantalla se alimentaba de `/api/crm/data`, que trae las 120 facturas más
 * recientes, y filtraba sobre eso en el navegador: con más de 120 facturas, una
 * búsqueda afirmaba que un recibo de la temporada pasada no existía, y el filtro
 * de fechas mentía sin avisar.
 */
export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get('page')) || 1))
  const q = (url.searchParams.get('q') || '').trim()
  const estado = (url.searchParams.get('estado') || '').trim()
  const from = (url.searchParams.get('from') || '').trim()
  const to = (url.searchParams.get('to') || '').trim()
  const esFecha = (v: string) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v)

  const where: Record<string, unknown> = {}

  // El filtro se aplica sobre la fecha de EMISIÓN, que es la que la tabla enseña.
  if (esFecha(from) || esFecha(to)) {
    where.issueDate = {
      ...(esFecha(from) ? { gte: new Date(from + 'T00:00:00') } : {}),
      ...(esFecha(to) ? { lte: new Date(to + 'T23:59:59.999') } : {}),
    }
  }

  if (q) {
    where.OR = [
      { invoiceNumber: { contains: q, mode: 'insensitive' } },
      { member: { name: { contains: q, mode: 'insensitive' } } },
      { items: { some: { description: { contains: q, mode: 'insensitive' } } } },
    ]
  }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  // Los estados que ve el tesorero se derivan de status + vencimiento + cobrado,
  // así que se traducen a condiciones de base de datos para no traerse todo.
  if (estado === 'Pagado') {
    where.status = 'PAID'
  } else if (estado === 'Vencido') {
    where.status = { notIn: ['PAID', 'VOID'] }
    where.dueDate = { lt: hoy }
  } else if (estado === 'Pago parcial') {
    where.status = { notIn: ['PAID', 'VOID'] }
    where.dueDate = { gte: hoy }
    where.paidAmount = { gt: 0 }
  } else if (estado === 'Pendiente') {
    where.status = { notIn: ['PAID', 'VOID'] }
    where.dueDate = { gte: hoy }
    where.paidAmount = { lte: 0 }
  }

  // Los totales se calculan sobre TODO el filtro, no sobre la página visible: si
  // no, las cifras de cabecera cambiarían al pasar de página.
  const whereRango = { ...where }
  delete (whereRango as { status?: unknown }).status
  delete (whereRango as { dueDate?: unknown }).dueDate
  delete (whereRango as { paidAmount?: unknown }).paidAmount

  const [total, rows, todasDelRango] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: { member: { select: { name: true, sportPreference: true } }, items: { take: 1 } },
      orderBy: { dueDate: 'desc' },
      skip: (page - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    prisma.invoice.findMany({
      where: whereRango,
      select: { totalAmount: true, paidAmount: true, status: true, dueDate: true },
    }),
  ])

  const totales = { total: 0, pendiente: 0, pagado: 0, vencido: 0 }
  for (const inv of todasDelRango) {
    totales.total += inv.totalAmount
    const e = crmInvoiceEstado(inv)
    if (e === 'Pagado') totales.pagado += inv.totalAmount
    else if (e === 'Vencido') totales.vencido += inv.totalAmount
    else totales.pendiente += inv.totalAmount
  }

  return NextResponse.json({
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / POR_PAGINA)),
    porPagina: POR_PAGINA,
    totales,
    cobros: rows.map((inv) => ({
      id: inv.id,
      numero: inv.invoiceNumber,
      tipoFactura: inv.kind,
      socio: inv.member.name,
      memberId: inv.memberId,
      concepto: inv.items[0]?.description ?? `Factura ${inv.invoiceNumber}`,
      monto: inv.totalAmount,
      subtotal: inv.subtotal,
      iva: inv.taxAmount,
      retencion: Math.max(0, inv.subtotal + inv.taxAmount - inv.totalAmount),
      estado: crmInvoiceEstado(inv),
      emision: inv.issueDate.toISOString().slice(0, 10),
      registro: inv.createdAt.toISOString().slice(0, 10),
      vencimiento: inv.dueDate.toISOString().slice(0, 10),
      deporte: inv.member.sportPreference?.trim() || '—',
      pendingAmount: Math.max(0, inv.totalAmount - inv.paidAmount),
    })),
  })
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const memberIdRaw = String(body.memberId || '').trim()
  const teamIdRaw = String(body.groupId || '').trim()
  const hasMember = Boolean(memberIdRaw)
  const hasTeam = Boolean(teamIdRaw)

  if (hasMember === hasTeam) {
    return NextResponse.json(
      { error: 'Indica memberId o groupId, pero no ambos.' },
      { status: 400 },
    )
  }

  const input = {
    concepto: String(body.concepto || ''),
    amount: Number(body.amount),
    dueDate: String(body.dueDate || ''),
    applyTax: typeof body.applyTax === 'boolean' ? body.applyTax : undefined,
    taxRate: Number(body.taxRate),
    applyWithholding:
      typeof body.applyWithholding === 'boolean' ? body.applyWithholding : undefined,
    withholdingRate: Number(body.withholdingRate),
  }

  try {
    if (hasTeam) {
      const parsedTeamId = parseCuid(teamIdRaw, 'groupId')
      if (parsedTeamId instanceof NextResponse) return parsedTeamId
      const result = await createTeamInvoices(parsedTeamId, input)
      return NextResponse.json({ ok: true, count: result.count, ids: result.ids })
    }

    const parsedMemberId = parseCuid(memberIdRaw, 'memberId')
    if (parsedMemberId instanceof NextResponse) return parsedMemberId
    const invoice = await createMemberInvoice(parsedMemberId, input)
    return NextResponse.json({ ok: true, id: invoice.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo crear el cobro'
    const status = msg.includes('no encontrado') ? 404 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

export const dynamic = 'force-dynamic'

const POR_PAGINA = 40

/**
 * Impagos agrupados POR SOCIO y paginados en el servidor.
 *
 * La pantalla se alimentaba de las 120 facturas más recientes de
 * `/api/crm/data`, ordenadas por vencimiento descendente: lo primero que se
 * perdía al pasar de 120 era justamente **la deuda más antigua**, que es la que
 * hay que reclamar primero. Con el club creciendo, llegó a decir «Todo al día»
 * con deuda viva.
 *
 * Se agrupa por socio porque el aviso ya se manda por socio (cubre todas sus
 * facturas): una fila por recibo hacía que se le avisara tres veces con el
 * mismo mensaje.
 */
export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get('page')) || 1))
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  // Solo las vencidas y con saldo. Se traen los campos mínimos: agrupar por
  // socio exige verlas todas, pero son unas pocas columnas por fila.
  const abiertas = await prisma.invoice.findMany({
    where: { status: { notIn: ['PAID', 'VOID'] }, dueDate: { lt: hoy } },
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      paidAmount: true,
      dueDate: true,
      memberId: true,
      member: { select: { name: true, phone: true, guardianPhone: true } },
      items: { take: 1, select: { description: true } },
    },
    orderBy: { dueDate: 'asc' },
  })

  type Fila = {
    id: string
    memberId: string
    socio: string
    telefono: string
    esTelefonoTutor: boolean
    total: number
    recibos: number
    numero: string
    concepto: string
    vencimiento: string
    diasVencida: number
    facturaId: string
  }

  const porSocio = new Map<string, Fila>()
  for (const inv of abiertas) {
    const pendiente = Math.max(0, inv.totalAmount - inv.paidAmount)
    if (pendiente <= 0) continue
    const dias = Math.max(0, Math.floor((hoy.getTime() - inv.dueDate.getTime()) / 86400000))
    const prev = porSocio.get(inv.memberId)
    if (!prev) {
      const propio = inv.member.phone?.trim() || ''
      const tutor = inv.member.guardianPhone?.trim() || ''
      porSocio.set(inv.memberId, {
        id: inv.memberId,
        memberId: inv.memberId,
        socio: inv.member.name,
        telefono: propio || tutor,
        esTelefonoTutor: !propio && Boolean(tutor),
        total: pendiente,
        recibos: 1,
        // Las facturas llegan ordenadas por vencimiento ascendente, así que la
        // primera de cada socio ya es la más antigua: la que marca la gravedad.
        numero: inv.invoiceNumber,
        concepto: inv.items[0]?.description ?? `Factura ${inv.invoiceNumber}`,
        vencimiento: inv.dueDate.toISOString().slice(0, 10),
        diasVencida: dias,
        facturaId: inv.id,
      })
      continue
    }
    prev.total += pendiente
    prev.recibos++
  }

  let filas = [...porSocio.values()]
  if (q) {
    filas = filas.filter((f) =>
      `${f.socio} ${f.concepto} ${f.numero}`.toLowerCase().includes(q),
    )
  }
  // Primero la deuda más vieja: es el orden en que hay que reclamar.
  filas.sort((a, b) => b.diasVencida - a.diasVencida)

  const total = filas.length
  const totalDeuda = filas.reduce((a, f) => a + f.total, 0)
  const recibosTotales = filas.reduce((a, f) => a + f.recibos, 0)

  // El gráfico de antigüedad y los mayores deudores se calculaban también sobre
  // las 120 facturas de la lista, así que dibujaban una deuda incompleta. Se
  // calculan aquí, sobre TODAS, y sin que el buscador los altere.
  const todas = [...porSocio.values()]
  const TRAMOS = [
    { label: '0-30 días', min: 0, max: 30 },
    { label: '31-60', min: 31, max: 60 },
    { label: '61-90', min: 61, max: 90 },
    { label: '+90', min: 91, max: Number.POSITIVE_INFINITY },
  ]
  const aging = TRAMOS.map((t) => ({
    label: t.label,
    importe: abiertas
      .filter((inv) => {
        const p = Math.max(0, inv.totalAmount - inv.paidAmount)
        if (p <= 0) return false
        const d = Math.floor((hoy.getTime() - inv.dueDate.getTime()) / 86400000)
        return d >= t.min && d <= t.max
      })
      .reduce((a, inv) => a + Math.max(0, inv.totalAmount - inv.paidAmount), 0),
  }))
  const antiguedadMedia = todas.length
    ? Math.round(todas.reduce((a, f) => a + f.diasVencida, 0) / todas.length)
    : 0
  const topMorosos = [...todas]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((f) => ({ id: f.memberId, nombre: f.socio, total: f.total, facturas: f.recibos }))

  return NextResponse.json({
    page,
    total,
    totalPages: Math.max(1, Math.ceil(total / POR_PAGINA)),
    totalDeuda,
    recibosTotales,
    sociosAfectados: todas.length,
    aging,
    antiguedadMedia,
    topMorosos,
    filas: filas.slice((page - 1) * POR_PAGINA, page * POR_PAGINA),
    /** Ids de TODOS los socios con deuda, para «Reenviar a todos». */
    todosLosIds: todas.map((f) => f.memberId),
  })
}

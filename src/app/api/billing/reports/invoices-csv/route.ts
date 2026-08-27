import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

/** Estados en cristiano: el CSV lo abre una persona, no un programa. */
const ESTADO: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  VOID: 'Anulada',
}

function fecha(d: Date): string {
  return d.toLocaleDateString('es-ES')
}

/** Importe con coma decimal, que es lo que espera un Excel en español. */
function importe(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

function toCsvRow(fields: Array<string | number>) {
  // Prefijo anti CSV-injection: si el campo empieza por =,+,-,@ o tab, se
  // antepone un apóstrofo para que Excel/Sheets no lo interprete como fórmula.
  return fields
    .map((f) => {
      let s = String(f)
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
      return `"${s.replaceAll('"', '""')}"`
    })
    .join(';')
}

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  // El boton «Exportar datos» esta debajo de un filtro de fechas y lo ignoraba:
  // el tesorero filtraba un trimestre y se descargaba el historico entero.
  const url = new URL(request.url)
  const from = (url.searchParams.get('from') || '').trim()
  const to = (url.searchParams.get('to') || '').trim()
  const esFecha = (v: string) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v)
  const rango: { gte?: Date; lte?: Date } = {}
  if (esFecha(from)) rango.gte = new Date(from + 'T00:00:00')
  if (esFecha(to)) rango.lte = new Date(to + 'T23:59:59.999')

  const invoices = await prisma.invoice.findMany({
    where: Object.keys(rango).length > 0 ? { issueDate: rango } : undefined,
    include: { member: true, items: { take: 1, select: { description: true } } },
    orderBy: { issueDate: 'desc' },
  })

  const lines = [
    toCsvRow([
      'Nº factura',
      'Socio',
      'Concepto',
      'Emitida',
      'Vencimiento',
      'Estado',
      'Total',
      'Cobrado',
      'Pendiente',
    ]),
    ...invoices.map((i) =>
      toCsvRow([
        i.invoiceNumber,
        i.member.name,
        i.items[0]?.description ?? '',
        fecha(i.issueDate),
        fecha(i.dueDate),
        ESTADO[i.status] ?? i.status,
        importe(i.totalAmount),
        importe(i.paidAmount),
        importe(Math.max(0, i.totalAmount - i.paidAmount)),
      ]),
    ),
  ]

  const sufijo = from || to ? '-' + (from || 'inicio') + '_' + (to || 'hoy') : ''
  // BOM al principio: sin el, Excel abre el fichero en ANSI y destroza las
  // tildes y la eñe de los nombres de los socios.
  const csv = '\uFEFF' + lines.join('\r\n')
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="facturas' + sufijo + '.csv"',
    },
  })
}


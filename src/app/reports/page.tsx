import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const [invoiceCount, overdueCount, overdueAmount] = await Promise.all([
    prisma.invoice.count(),
    prisma.invoice.count({ where: { status: 'OVERDUE' } }),
    prisma.invoice
      .findMany({ where: { status: 'OVERDUE' }, select: { totalAmount: true, paidAmount: true } })
      .then((rows) => rows.reduce((acc, r) => acc + (r.totalAmount - r.paidAmount), 0)),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Informes</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-slate-500">Facturas totales</p>
          <p className="text-2xl font-bold">{invoiceCount}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-slate-500">Facturas vencidas</p>
          <p className="text-2xl font-bold">{overdueCount}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-sm text-slate-500">Deuda vencida</p>
          <p className="text-2xl font-bold">€{overdueAmount.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <h2 className="font-semibold mb-3">Exportaciones</h2>
        <Link
          href="/api/billing/reports/invoices-csv"
          className="inline-flex px-4 py-2 rounded-lg bg-slate-900 text-white font-medium"
        >
          Descargar informe CSV de facturas
        </Link>
      </div>
    </div>
  )
}


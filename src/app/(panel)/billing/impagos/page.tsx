import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export default async function ImpagosPage() {
  const today = startOfDay(new Date())
  const candidates = await prisma.invoice.findMany({
    where: {
      status: { in: ['OVERDUE', 'PARTIAL', 'PENDING'] },
    },
    include: { member: true },
    orderBy: { dueDate: 'asc' },
  })

  const impagos = candidates.filter((i) => {
    const pending = i.totalAmount - i.paidAmount
    if (pending <= 0) return false
    if (i.status === 'OVERDUE' || i.status === 'PARTIAL') return true
    return i.status === 'PENDING' && i.dueDate < today
  })

  const totalPendiente = impagos.reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0)

  return (
    <div className="space-y-6">
      <Link href="/billing" className="text-blue-600 hover:underline text-sm">
        ← Volver a Billing
      </Link>
      <div className="flex flex-wrap justify-between gap-4 items-start">
        <div>
          <h1 className="text-3xl font-bold">Impagos</h1>
          <p className="text-slate-600 mt-1">
            Facturas vencidas o parcialmente pagadas, y cuotas pendientes con vencimiento pasado.
          </p>
        </div>
        <div className="bg-white border rounded-lg px-4 py-3">
          <p className="text-xs text-slate-500 uppercase">Total pendiente (lista)</p>
          <p className="text-2xl font-bold text-rose-600">€{totalPendiente.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-left">Factura</th>
              <th className="p-3 text-left">Socio</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3 text-left">Vencimiento</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-right">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {impagos.map((inv) => {
              const pend = inv.totalAmount - inv.paidAmount
              return (
                <tr key={inv.id} className="border-t">
                  <td className="p-3">
                    <Link
                      href={`/billing/invoices/${inv.id}`}
                      className="text-blue-600 font-medium hover:underline"
                    >
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="p-3">{inv.member.name}</td>
                  <td className="p-3">
                    {inv.kind === 'OTHER' ? (
                      <span className="text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                        Otro cobro
                      </span>
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                        Cuota
                      </span>
                    )}
                  </td>
                  <td className="p-3">{new Date(inv.dueDate).toLocaleDateString('es-ES')}</td>
                  <td className="p-3">{inv.status}</td>
                  <td className="p-3 text-right font-semibold">€{pend.toFixed(2)}</td>
                </tr>
              )
            })}
            {impagos.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  No hay impagos en este momento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

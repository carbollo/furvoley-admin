import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PayMyInvoiceButton } from './PayMyInvoiceButton'

export const dynamic = 'force-dynamic'

export default async function MyBillingPage() {
  const session = await getServerSession(authOptions)
  const memberId = session?.user?.memberId

  const invoices = memberId
    ? await prisma.invoice.findMany({
        where: { memberId },
        orderBy: { issueDate: 'desc' },
      })
    : []

  const debt = invoices
    .filter((i) => i.status !== 'PAID' && i.status !== 'VOID')
    .reduce((acc, i) => acc + (i.totalAmount - i.paidAmount), 0)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Mis Pagos</h1>
      <div className="bg-white rounded-lg border p-5">
        <p className="text-sm text-slate-500">Deuda actual</p>
        <p className="text-2xl font-bold">€{debt.toFixed(2)}</p>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-left">Factura</th>
              <th className="p-3 text-left">Vencimiento</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-left">Pendiente</th>
              <th className="p-3 text-left">Acción</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => {
              const pending = Math.max(0, invoice.totalAmount - invoice.paidAmount)
              return (
                <tr key={invoice.id} className="border-t">
                  <td className="p-3">{invoice.invoiceNumber}</td>
                  <td className="p-3">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                  <td className="p-3">{invoice.status}</td>
                  <td className="p-3">€{pending.toFixed(2)}</td>
                  <td className="p-3">{pending > 0 ? <PayMyInvoiceButton invoiceId={invoice.id} /> : 'Pagada'}</td>
                </tr>
              )
            })}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  No hay facturas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


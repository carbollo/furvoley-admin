import { prisma } from '@/lib/prisma'
import { PaymentForm } from './PaymentForm'
import { CheckCircle2, Clock } from 'lucide-react'
import { updatePaymentStatus } from '@/app/actions'

export const dynamic = 'force-dynamic'

export default async function PaymentsPage() {
  const payments = await prisma.payment.findMany({
    include: { member: true },
    orderBy: { createdAt: 'desc' }
  })

  const members = await prisma.member.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' }
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Cobros Mensuales</h1>
        <PaymentForm members={members} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="p-4 font-medium text-slate-600">Socio</th>
              <th className="p-4 font-medium text-slate-600">Monto</th>
              <th className="p-4 font-medium text-slate-600">Mes/Año</th>
              <th className="p-4 font-medium text-slate-600">Estado</th>
              <th className="p-4 font-medium text-slate-600 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(payment => (
              <tr key={payment.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="p-4 font-medium">{payment.member.name}</td>
                <td className="p-4 font-bold text-slate-700">${payment.amount}</td>
                <td className="p-4 text-slate-600">{payment.month}/{payment.year}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center w-max space-x-1 ${
                    payment.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {payment.status === 'PAID' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                    <span>{payment.status === 'PAID' ? 'Pagado' : 'Pendiente'}</span>
                  </span>
                </td>
                <td className="p-4 text-right">
                  {payment.status === 'PENDING' && (
                    <form action={updatePaymentStatus.bind(null, payment.id, 'PAID')} className="inline">
                      <button type="submit" className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1 rounded-lg transition">
                        Marcar Pagado
                      </button>
                    </form>
                  )}
                  {payment.status === 'PAID' && (
                    <span className="text-sm text-slate-400">
                      {payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : '-'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  No hay cobros registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { prisma } from '@/lib/prisma'
import { Users, CreditCard, TrendingUp, TrendingDown } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const membersCount = await prisma.member.count({ where: { status: 'ACTIVE' } })
  const pendingPayments = await prisma.payment.count({ where: { status: 'PENDING' } })
  
  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()

  const paymentsThisMonth = await prisma.payment.aggregate({
    where: { month: currentMonth, year: currentYear, status: 'PAID' },
    _sum: { amount: true }
  })

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <Users size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Socios Activos</p>
            <p className="text-2xl font-bold">{membersCount}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-amber-100 text-amber-600 rounded-lg">
            <CreditCard size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Cobros Pendientes</p>
            <p className="text-2xl font-bold">{pendingPayments}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Ingresos del Mes</p>
            <p className="text-2xl font-bold">${paymentsThisMonth._sum.amount || 0}</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-semibold mb-4">Resumen Rápido</h2>
        <p className="text-slate-600">Bienvenido al panel de administración de Furvoley. Usa el menú lateral para gestionar socios, cobros y ver la contabilidad completa.</p>
      </div>
    </div>
  )
}

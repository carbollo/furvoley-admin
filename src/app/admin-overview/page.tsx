import { prisma } from '@/lib/prisma'
import { Users, CreditCard, TrendingDown, TrendingUp } from 'lucide-react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Vista “clásica” con KPI en Tailwind — enlazada desde el CRM SPA (Panel clásico). */
export default async function AdminOverviewPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/')
  }

  const membersCount = await prisma.member.count({ where: { status: 'ACTIVE' } })
  const pendingPayments = await prisma.payment.count({ where: { status: 'PENDING' } })
  const overdueInvoices = await prisma.invoice.count({ where: { status: 'OVERDUE' } })
  const overdueData = await prisma.invoice.findMany({ where: { status: 'OVERDUE' } })

  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()

  const paymentsThisMonth = await prisma.payment.aggregate({
    where: { month: currentMonth, year: currentYear, status: 'PAID' },
    _sum: { amount: true },
  })

  return (
    <div>
      <p className="text-sm text-slate-500 mb-4">
        <Link href="/crm.html#dashboard" className="text-blue-600 hover:underline">
          ← Volver al CRM
        </Link>
      </p>
      <h1 className="text-3xl font-bold mb-8">Dashboard Admin (clásico)</h1>

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
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-rose-100 text-rose-600 rounded-lg">
            <TrendingDown size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Facturas Vencidas</p>
            <p className="text-2xl font-bold">{overdueInvoices}</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-semibold mb-4">Resumen Rápido</h2>
        <p className="text-slate-600">
          Bienvenido al panel de administración de Furvoley (vista anterior al CRM).
        </p>
        <p className="text-slate-600 mt-3 font-medium">
          Deuda vencida total: €
          {overdueData.reduce((acc, i) => acc + (i.totalAmount - i.paidAmount), 0).toFixed(2)}
        </p>
        <Link href="/billing" className="inline-block mt-4 text-blue-600 hover:underline">
          Ir a Billing
        </Link>
      </div>
    </div>
  )
}

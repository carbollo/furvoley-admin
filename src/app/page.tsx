import { prisma } from '@/lib/prisma'
import { Users, CreditCard, TrendingUp, TrendingDown, Calendar as CalendarIcon } from 'lucide-react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <h1 className="text-3xl font-bold mb-4">Bienvenido a Furvoley</h1>
        <p className="text-slate-600 mb-8">Inicia sesión para acceder a tu panel.</p>
        <Link href="/login" className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition">
          Iniciar Sesión
        </Link>
      </div>
    )
  }

  const isAdmin = session.user.role === 'ADMIN'

  if (isAdmin) {
    const membersCount = await prisma.member.count({ where: { status: 'ACTIVE' } })
    const pendingPayments = await prisma.payment.count({ where: { status: 'PENDING' } })
    const overdueInvoices = await prisma.invoice.count({ where: { status: 'OVERDUE' } })
    const overdueData = await prisma.invoice.findMany({ where: { status: 'OVERDUE' } })
    
    const currentMonth = new Date().getMonth() + 1
    const currentYear = new Date().getFullYear()

    const paymentsThisMonth = await prisma.payment.aggregate({
      where: { month: currentMonth, year: currentYear, status: 'PAID' },
      _sum: { amount: true }
    })

    return (
      <div>
        <h1 className="text-3xl font-bold mb-8">Dashboard Admin</h1>
        
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
          <p className="text-slate-600">Bienvenido al panel de administración de Furvoley. Ahora tienes el módulo Billing para suscripciones, facturas, mora y exportación contable.</p>
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

  // PLAYER / COACH DASHBOARD
  const userMember = await prisma.member.findUnique({
    where: { id: session.user?.memberId || '' },
    include: {
      teamRoles: {
        include: { team: true }
      }
    }
  })

  const memberInvoices = userMember
    ? await prisma.invoice.findMany({
        where: { memberId: userMember.id },
        orderBy: { issueDate: 'desc' },
        take: 5,
      })
    : []

  const debt = memberInvoices
    .filter((i) => i.status !== 'PAID' && i.status !== 'VOID')
    .reduce((acc, i) => acc + (i.totalAmount - i.paidAmount), 0)

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Mi Panel</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Hola, {session.user.name}</h2>
            <p className="text-slate-600">Revisa tu calendario para ver los próximos eventos de tu equipo.</p>
            <div className="mt-6">
              <Link href="/calendar" className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition">
                <CalendarIcon size={20} />
                <span>Ver Mi Calendario</span>
              </Link>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-100">
              <p className="text-sm text-slate-500">Deuda actual</p>
              <p className="text-xl font-bold text-slate-900">€{debt.toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-bold text-slate-800">Mis facturas recientes</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {memberInvoices.map((invoice) => (
                <li key={invoice.id} className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{invoice.invoiceNumber}</p>
                      <p className="text-sm text-slate-500">
                        Vence: {new Date(invoice.dueDate).toLocaleDateString()} - {invoice.status}
                      </p>
                    </div>
                    <Link href="/my-billing" className="text-blue-600 hover:underline text-sm">
                      Ver / Pagar
                    </Link>
                  </div>
                </li>
              ))}
              {memberInvoices.length === 0 && (
                <li className="p-4 text-sm text-slate-500">No hay facturas aún.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h2 className="font-bold text-slate-800">Mis Equipos</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {userMember?.teamRoles.map(role => (
                <li key={role.id} className="p-4">
                  <p className="font-bold text-slate-900">{role.team.name}</p>
                  <p className="text-sm text-slate-500 capitalize">{role.role === 'COACH' ? 'Entrenador' : 'Jugador'}</p>
                </li>
              ))}
              {(!userMember || userMember.teamRoles.length === 0) && (
                <li className="p-4 text-slate-500 text-sm">No estás asignado a ningún equipo.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

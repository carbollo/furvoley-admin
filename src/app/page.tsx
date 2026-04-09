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
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h2 className="text-xl font-semibold mb-4">Resumen Rápido</h2>
          <p className="text-slate-600">Bienvenido al panel de administración de Furvoley. Usa el menú lateral para gestionar socios, equipos, cobros y ver la contabilidad completa.</p>
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

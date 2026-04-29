import { prisma } from '@/lib/prisma'
import { Calendar as CalendarIcon } from 'lucide-react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import CrmApp from '@/components/crm/CrmApp'
import { AppShell } from '@/components/AppShell'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const role = (session.user as { role?: string }).role
  if (role === 'ADMIN') {
    return (
      <Suspense fallback={<div className="p-8 text-slate-600">Cargando CRM…</div>}>
        <CrmApp />
      </Suspense>
    )
  }

  const userMember = await prisma.member.findUnique({
    where: { id: session.user?.memberId || '' },
    include: {
      teamRoles: {
        include: { team: true },
      },
    },
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
    <AppShell>
      <div>
      <h1 className="text-3xl font-bold mb-8">Mi Panel</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Hola, {session.user.name}</h2>
            <p className="text-slate-600">Revisa tu calendario para ver los próximos eventos de tu equipo.</p>
            <div className="mt-6">
              <Link
                href="/calendar"
                className="inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
              >
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
              {userMember?.teamRoles.map((role) => (
                <li key={role.id} className="p-4">
                  <p className="font-bold text-slate-900">{role.team.name}</p>
                  <p className="text-sm text-slate-500 capitalize">
                    {role.role === 'COACH' ? 'Entrenador' : 'Jugador'}
                  </p>
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
    </AppShell>
  )
}

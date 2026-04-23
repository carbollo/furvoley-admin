'use client'

import Link from 'next/link'
import { Users, CreditCard, Calculator, Home, Calendar, LogOut, Receipt, FileText, GitBranch } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()

  const isJoinRoute = pathname === '/join' || pathname.startsWith('/join/')
  if (pathname === '/login' || isJoinRoute) return null

  const isAdmin = session?.user?.role === 'ADMIN'

  return (
    <div className="w-64 bg-slate-900 text-white min-h-screen p-4 flex flex-col">
      <div className="text-2xl font-bold mb-8 text-center text-blue-400">Furvoley Admin</div>
      
      <div className="mb-6 px-3">
        <p className="text-sm text-slate-400">Hola,</p>
        <p className="font-medium truncate">{session?.user?.name || session?.user?.email}</p>
        <span className="text-xs bg-slate-800 px-2 py-1 rounded mt-1 inline-block text-slate-300">
          {session?.user?.role}
        </span>
      </div>

      <nav className="flex-1 space-y-2">
        <Link href="/" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
          <Home size={20} />
          <span>Dashboard</span>
        </Link>
        <Link href="/calendar" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
          <Calendar size={20} />
          <span>Calendario</span>
        </Link>
        {!isAdmin && (
          <Link href="/my-billing" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
            <CreditCard size={20} />
            <span>Mis Pagos</span>
          </Link>
        )}
        
        {isAdmin && (
          <>
            <div className="pt-4 pb-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Administración
            </div>
            <Link href="/teams" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
              <Users size={20} />
              <span>Equipos</span>
            </Link>
            <Link href="/members" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
              <Users size={20} />
              <span>Socios</span>
            </Link>
            <Link href="/payments" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
              <CreditCard size={20} />
              <span>Cobros</span>
            </Link>
            <Link href="/billing" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
              <Receipt size={20} />
              <span>Billing</span>
            </Link>
            <Link href="/billing/impagos" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition pl-6 text-slate-300 text-sm">
              <Receipt size={16} />
              <span>Impagos</span>
            </Link>
            <Link href="/accounting" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
              <Calculator size={20} />
              <span>Contabilidad</span>
            </Link>
            <Link href="/reports" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
              <FileText size={20} />
              <span>Informes</span>
            </Link>
            <Link href="/workflows" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
              <GitBranch size={20} />
              <span>Workflows</span>
            </Link>
          </>
        )}
      </nav>
      
      <div className="mt-auto pt-4 border-t border-slate-800">
        <button 
          onClick={() => signOut()} 
          className="flex items-center space-x-3 p-3 w-full rounded hover:bg-rose-900/50 text-rose-400 transition"
        >
          <LogOut size={20} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </div>
  )
}

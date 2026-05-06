'use client'

import Link from 'next/link'
import {
  Calculator,
  Home,
  Calendar,
  LogOut,
  CreditCard,
  Receipt,
  Landmark,
  ChevronDown,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

function isAccountingSectionPath(path: string) {
  return (
    path === '/accounting' ||
    path.startsWith('/accounting/')
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [accountingOpen, setAccountingOpen] = useState(() => isAccountingSectionPath(pathname ?? ''))

  useEffect(() => {
    if (isAccountingSectionPath(pathname)) {
      setAccountingOpen(true)
    }
  }, [pathname])

  const isJoinRoute = pathname === '/join' || pathname.startsWith('/join/')
  const isPublicEventShare =
    /^\/events\/[^/]+$/.test(pathname) && pathname !== '/events/new'
  if (pathname === '/login' || isJoinRoute) return null
  if (isPublicEventShare && !session) return null

  const isAdmin = session?.user?.role === 'ADMIN'

  return (
    <div className="w-64 bg-slate-900 text-white min-h-screen p-4 flex flex-col">
      <div className="text-2xl font-bold mb-8 text-center text-blue-400">Administración Furvoley</div>

      <div className="mb-6 px-3">
        <p className="text-sm text-slate-400">Hola,</p>
        <p className="font-medium truncate">{session?.user?.name || session?.user?.email}</p>
        <span className="text-xs bg-slate-800 px-2 py-1 rounded mt-1 inline-block text-slate-300">
          {session?.user?.role === 'ADMIN'
            ? 'Administrador'
            : session?.user?.role === 'MEMBER'
              ? 'Socio'
              : session?.user?.role}
        </span>
      </div>

      <nav className="flex-1 space-y-2">
        {isAdmin ? (
          <Link href="/" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
            <Home size={20} />
            <span>Panel CRM</span>
          </Link>
        ) : (
          <Link href="/" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
            <Home size={20} />
            <span>Inicio</span>
          </Link>
        )}
        {!isAdmin && (
          <Link href="/calendar" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
            <Calendar size={20} />
            <span>Calendario</span>
          </Link>
        )}
        {!isAdmin && (
          <Link href="/my-billing" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
            <CreditCard size={20} />
            <span>Mis Pagos</span>
          </Link>
        )}

        {isAdmin && (
          <div className="rounded-lg overflow-hidden pt-2">
            <button
              type="button"
              onClick={() => setAccountingOpen((o) => !o)}
              className={`flex w-full items-center space-x-3 p-3 rounded-lg text-left transition-colors ${
                isAccountingSectionPath(pathname ?? '')
                  ? 'bg-slate-800/80'
                  : 'hover:bg-slate-800'
              }`}
              aria-expanded={accountingOpen}
            >
              <Calculator size={20} className="shrink-0" />
              <span className="flex-1 font-medium truncate">Contabilidad</span>
              <ChevronDown
                size={18}
                className={`shrink-0 text-slate-400 transition-transform duration-200 ${accountingOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {accountingOpen && (
              <div className="mt-1 ml-2 pl-3 border-l border-slate-700 space-y-1 py-1">
                <Link
                  href="/accounting"
                  className={`flex items-center space-x-3 py-2 px-2 rounded-md text-sm transition ${
                    pathname === '/accounting'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <Calculator size={16} className="shrink-0 opacity-90" />
                  <span>Resumen</span>
                </Link>
                <Link
                  href="/?tab=cobros"
                  className={`flex items-center space-x-3 py-2 px-2 rounded-md text-sm transition ${
                    'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <Receipt size={16} className="shrink-0 opacity-90" />
                  <span>Impagos</span>
                </Link>
                <Link
                  href="/accounting/bank-import"
                  className={`flex items-center space-x-3 py-2 px-2 rounded-md text-sm transition ${
                    pathname?.startsWith('/accounting/bank-import')
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <Landmark size={16} className="shrink-0 opacity-90" />
                  <span>Extracto bancario</span>
                </Link>
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="mt-auto pt-4 border-t border-slate-800">
        <button
          type="button"
          onClick={() => signOut()}
          className="flex items-center space-x-3 p-3 w-full rounded hover:bg-rose-900/50 text-rose-400 transition"
        >
          <LogOut size={20} />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  )
}

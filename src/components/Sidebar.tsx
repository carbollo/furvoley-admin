'use client'

import Link from 'next/link'
import { Users, CreditCard, Calculator, Home, Calendar, LogOut, Receipt, FileText, GitBranch, Landmark, ChevronDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

function isAccountingSectionPath(path: string) {
  return (
    path === '/accounting' ||
    path.startsWith('/accounting/') ||
    path.startsWith('/billing/impagos')
  )
}

/** Sección activa dentro de /crm.html (SPA), para resaltar el ítem del menú. */
function useCrmSectionHash() {
  const pathname = usePathname()
  const [section, setSection] = useState<string>(() => {
    if (typeof window === 'undefined' || pathname !== '/crm.html') return ''
    return window.location.hash.replace(/^#\/?/, '').toLowerCase() || 'dashboard'
  })
  useEffect(() => {
    if (pathname !== '/crm.html') {
      setSection('')
      return
    }
    const sync = () =>
      setSection(window.location.hash.replace(/^#\/?/, '').toLowerCase() || 'dashboard')
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [pathname])
  return pathname === '/crm.html' ? section : ''
}

export function Sidebar() {
  const pathname = usePathname()
  const crmSection = useCrmSectionHash()
  const { data: session } = useSession()
  const [accountingOpen, setAccountingOpen] = useState(() => isAccountingSectionPath(pathname))

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

  /** /crm.html es HTML estático: no monta este layout; no hay que ocultar nada aquí. */
  const isAdmin = session?.user?.role === 'ADMIN'
  const crm = (s: string) => `/crm.html#${s}`

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
        {isAdmin ? (
          <Link
            href={crm('dashboard')}
            className={`flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition ${
              pathname === '/crm.html' &&
              (crmSection === '' || crmSection === 'dashboard')
                ? 'bg-slate-800'
                : ''
            }`}
          >
            <Home size={20} />
            <span>Inicio (CRM)</span>
          </Link>
        ) : (
          <Link href="/" className="flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition">
            <Home size={20} />
            <span>Dashboard</span>
          </Link>
        )}
        {isAdmin ? (
          <Link
            href={crm('calendario')}
            className={`flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition ${
              pathname === '/crm.html' && crmSection === 'calendario' ? 'bg-slate-800' : ''
            }`}
          >
            <Calendar size={20} />
            <span>Calendario</span>
          </Link>
        ) : (
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
          <>
            <div className="pt-4 pb-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              CRM (misma interfaz)
            </div>
            <Link
              href={crm('equipos')}
              className={`flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition ${
                pathname === '/crm.html' && crmSection === 'equipos' ? 'bg-slate-800' : ''
              }`}
            >
              <Users size={20} />
              <span>Equipos</span>
            </Link>
            <Link
              href={crm('socios')}
              className={`flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition ${
                pathname === '/crm.html' && crmSection === 'socios' ? 'bg-slate-800' : ''
              }`}
            >
              <Users size={20} />
              <span>Socios</span>
            </Link>
            <Link
              href={crm('cobros')}
              className={`flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition ${
                pathname === '/crm.html' && crmSection === 'cobros' ? 'bg-slate-800' : ''
              }`}
            >
              <CreditCard size={20} />
              <span>Cobros / facturas</span>
            </Link>
            <div className="rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setAccountingOpen((o) => !o)}
                className={`flex w-full items-center space-x-3 p-3 rounded-lg text-left transition-colors ${
                  isAccountingSectionPath(pathname) ? 'bg-slate-800/80' : 'hover:bg-slate-800'
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
                    href="/billing/impagos"
                    className={`flex items-center space-x-3 py-2 px-2 rounded-md text-sm transition ${
                      pathname.startsWith('/billing/impagos')
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                    }`}
                  >
                    <Receipt size={16} className="shrink-0 opacity-90" />
                    <span>Impagos</span>
                  </Link>
                  <Link
                    href="/accounting/bank-import"
                    className={`flex items-center space-x-3 py-2 px-2 rounded-md text-sm transition ${
                      pathname.startsWith('/accounting/bank-import')
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
            <Link
              href={crm('informes')}
              className={`flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition ${
                pathname === '/crm.html' && crmSection === 'informes' ? 'bg-slate-800' : ''
              }`}
            >
              <FileText size={20} />
              <span>Informes</span>
            </Link>
            <Link
              href={crm('workflows')}
              className={`flex items-center space-x-3 p-3 rounded hover:bg-slate-800 transition ${
                pathname === '/crm.html' && crmSection === 'workflows' ? 'bg-slate-800' : ''
              }`}
            >
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

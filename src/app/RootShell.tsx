'use client'

import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Sidebar } from '@/components/Sidebar'

/**
 * "/" para ADMIN muestra el CRM (crm.html vía rewrite): sin sidebar a pantalla completa.
 * PLAYER/COACH y el resto de rutas conservan Sidebar + área principal.
 */
export default function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const role = session?.user && 'role' in session.user ? (session.user as { role?: string }).role : undefined

  const adminFullBleedHome =
    (pathname === '/' || pathname === '/crm.html') && role === 'ADMIN'

  // Evitar parpadeo: mientras hidrata la sesión en "/", no dibujar el shell con sidebar
  if (status === 'loading' && pathname === '/') {
    return <div className="min-h-screen w-full">{children}</div>
  }

  if (adminFullBleedHome) {
    return <div className="min-h-screen w-full">{children}</div>
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto h-screen">{children}</main>
    </div>
  )
}

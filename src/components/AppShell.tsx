'use client'

import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Sidebar } from '@/components/Sidebar'

import type { ReactNode } from 'react'

/** ADMIN en / ve solo el CRM (pantalla completa). Otros rutas conservan sidebar + main. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const hideChrome = pathname === '/' && session?.user?.role === 'ADMIN'

  if (hideChrome) {
    return <>{children}</>
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto h-screen">{children}</main>
    </>
  )
}

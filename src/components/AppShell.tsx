'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'

import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/crm') {
    return <>{children}</>
  }
  return (
    <>
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto h-screen">{children}</main>
    </>
  )
}

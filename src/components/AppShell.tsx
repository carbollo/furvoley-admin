'use client'

import { Sidebar } from '@/components/Sidebar'

import type { ReactNode } from 'react'

/** Sidebar + área principal. La raíz `/` (CRM admin y login) usa el layout sin este shell. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto h-screen">{children}</main>
    </>
  )
}

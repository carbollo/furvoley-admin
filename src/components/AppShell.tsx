'use client'

import { Sidebar } from '@/components/Sidebar'

import type { CSSProperties, ReactNode } from 'react'

const mainStyle: CSSProperties = {
  flex: 1,
  height: '100vh',
  overflowY: 'auto',
  background: '#f8fafc',
  color: '#0f172a',
  fontFamily: 'inherit',
  padding: '32px 36px',
  boxSizing: 'border-box',
}

const mainStyleNoPad: CSSProperties = {
  flex: 1,
  height: '100vh',
  overflowY: 'auto',
  background: '#f8fafc',
  color: '#0f172a',
  fontFamily: 'inherit',
  padding: 0,
  boxSizing: 'border-box',
}

/** Sidebar + área principal compartida por las rutas (panel). */
export function AppShell({
  children,
  flush = false,
}: {
  children: ReactNode
  /** Si true, el área principal no tiene padding (la página gestiona el suyo). */
  flush?: boolean
}) {
  return (
    <>
      <Sidebar />
      <main style={flush ? mainStyleNoPad : mainStyle}>{children}</main>
    </>
  )
}

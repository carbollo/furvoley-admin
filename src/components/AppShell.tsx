import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Sidebar } from '@/components/Sidebar'
import { MemberShell } from '@/components/member/MemberShell'
import { normalizeRole } from '@/lib/rbac'

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

/**
 * Layout principal del panel. Server component que decide el shell
 * según el rol de la sesión: socios usan `MemberShell` (diseño Stitch),
 * staff (ADMIN/COACH/TREASURER) usa el sidebar clásico.
 */
export async function AppShell({
  children,
  flush = false,
}: {
  children: ReactNode
  flush?: boolean
}) {
  const session = await getServerSession(authOptions)
  const role = normalizeRole(session?.user?.role)

  if (role === 'MEMBER') {
    return <MemberShell>{children}</MemberShell>
  }

  return (
    <>
      <Sidebar />
      <main style={flush ? mainStyleNoPad : mainStyle}>{children}</main>
    </>
  )
}

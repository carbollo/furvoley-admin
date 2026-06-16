import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Sidebar } from '@/components/Sidebar'
import { MemberShell } from '@/components/member/MemberShell'
import { normalizeRole } from '@/lib/rbac'
import { getClubBranding } from '@/lib/club-settings'

import type { CSSProperties, ReactNode } from 'react'

export const dynamic = 'force-dynamic'

const mainStyle: CSSProperties = {
  flex: 1,
  height: '100vh',
  overflowY: 'auto',
  background: '#faf7f2',
  color: '#1c1917',
  fontFamily: 'inherit',
  padding: '32px 36px',
  boxSizing: 'border-box',
}

const mainStyleNoPad: CSSProperties = {
  flex: 1,
  height: '100vh',
  overflowY: 'auto',
  background: '#faf7f2',
  color: '#1c1917',
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
  const branding = await getClubBranding()

  if (role === 'MEMBER') {
    return (
      <MemberShell
        branding={{
          name: branding.name,
          logoUrl: branding.logoUrl,
          primaryColor: branding.primaryColor,
          subtitle: branding.subtitle,
        }}
      >
        {children}
      </MemberShell>
    )
  }

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '100vh' }}>
      <Sidebar branding={branding} />
      <main style={flush ? mainStyleNoPad : mainStyle}>{children}</main>
    </div>
  )
}

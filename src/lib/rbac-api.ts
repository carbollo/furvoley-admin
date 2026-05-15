import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { hasRole, normalizeRole, type AppRole } from '@/lib/rbac'

export type SessionRole = AppRole

export async function getSessionRole() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { session: null, role: null as SessionRole | null }
  return { session, role: normalizeRole(session.user.role) as SessionRole }
}

export async function requireRoles(allowed: AppRole[]) {
  const { session, role } = await getSessionRole()
  if (!session?.user || !role || !hasRole(role, allowed)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  return {
    ok: true as const,
    session,
    role,
  }
}

import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { hasRole, normalizeRole, type AppRole } from '@/lib/rbac'
import { getSessionFromRequest } from '@/lib/session'

export type SessionRole = AppRole

export async function getSessionRole(request?: Request) {
  const session = request
    ? await getSessionFromRequest(request)
    : await getServerSession(authOptions)
  if (!session?.user) return { session: null, role: null as SessionRole | null }
  return { session, role: normalizeRole(session.user.role) as SessionRole }
}

export async function requireRoles(allowed: AppRole[], request?: Request) {
  const { session, role } = await getSessionRole(request)
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

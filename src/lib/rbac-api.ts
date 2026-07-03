import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hasRole, normalizeRole, type AppRole } from '@/lib/rbac'
import { getSessionFromRequest } from '@/lib/session'
import { enterTenantFromRequest } from '@/lib/multitenant/request'

export type SessionRole = AppRole

export async function getSessionRole(request?: Request) {
  const session = request
    ? await getSessionFromRequest(request)
    : await getServerSession(authOptions)
  if (!session?.user) return { session: null, role: null as SessionRole | null }
  return { session, role: normalizeRole(session.user.role) as SessionRole }
}

export async function requireRoles(allowed: AppRole[], request?: Request) {
  // Activa la BD del tenant (multi-tenant) antes de cualquier consulta.
  await enterTenantFromRequest(request)
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

/**
 * Comprueba que el usuario puede MUTAR un equipo concreto.
 * - ADMIN: cualquier equipo.
 * - COACH: solo equipos que entrena (TeamMember role=COACH).
 * Devuelve una respuesta 403 si no procede, o `null` si tiene acceso.
 *
 * Cierra el gap por el que un COACH podía modificar la plantilla, horarios o
 * datos de equipos que no entrena (los endpoints solo exigían rol COACH).
 */
export async function assertTeamAccess(
  auth: { role: SessionRole; session: Session },
  teamId: string,
): Promise<NextResponse | null> {
  if (auth.role === 'ADMIN') return null
  if (auth.role === 'COACH') {
    const memberId = (auth.session.user as { memberId?: string | null } | undefined)?.memberId || null
    if (memberId) {
      const owns = await prisma.teamMember.findFirst({
        where: { teamId, memberId, role: 'COACH' },
        select: { id: true },
      })
      if (owns) return null
    }
  }
  return NextResponse.json({ error: 'No tienes acceso a este equipo' }, { status: 403 })
}

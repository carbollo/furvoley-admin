import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hasRole, normalizeRole, type AppRole } from '@/lib/rbac'
import { getSessionFromRequest } from '@/lib/session'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { currentTenant } from '@/lib/multitenant/context'
import { getTenantFeatures } from '@/lib/tenant-features'
import { isModuleEnabled, type CrmModuleId } from '@/lib/crm-modules'

export type SessionRole = AppRole

/**
 * Gate por plan del club a nivel de SERVIDOR. Además de ocultarse en la UI, las
 * rutas de un módulo desactivado en el tenant devuelven 403 (defensa en
 * profundidad: un ADMIN/COACH no puede usar por API un módulo fuera de su plan).
 * El módulo se infiere del prefijo de la URL. La mayoría de rutas heredan el gate
 * vía requireRoles; las que autentican por su cuenta (whatsapp/**, workflows/**)
 * llaman a `assertModuleForRequest(request)` directamente. Solo se gatean prefijos
 * de módulos AISLADOS: se excluyen a propósito /api/crm/invoices, /products y
 * /discounts porque el flujo CORE de cuotas/socios (p.ej. marcar una cuota pagada
 * vía /api/crm/invoices/:id/mark-paid) los comparte y no debe acoplarse al plan.
 * Fail-open: si no se pueden leer los flags, no se bloquea nada.
 */
const MODULE_ROUTE_PREFIXES: { prefix: string; module: CrmModuleId }[] = [
  { prefix: '/api/crm/training', module: 'entrenamiento' },
  { prefix: '/api/crm/workflows', module: 'workflows' },
  { prefix: '/api/crm/whatsapp', module: 'whatsapp' },
  { prefix: '/api/crm/chat', module: 'whatsapp' },
  { prefix: '/api/crm/accounting', module: 'contabilidad' },
  { prefix: '/api/hermes', module: 'hermes' },
]

/**
 * Devuelve una respuesta 403 si la ruta pertenece a un módulo desactivado en el
 * tenant, o null si está permitido. Requiere que el tenant ya esté activo
 * (requireRoles o enterTenantFromRequest lo hacen antes).
 */
export async function assertModuleForRequest(request?: Request): Promise<NextResponse | null> {
  if (!request) return null
  let pathname: string
  try {
    pathname = new URL(request.url).pathname
  } catch {
    return null
  }
  const match = MODULE_ROUTE_PREFIXES.find(
    (m) => pathname === m.prefix || pathname.startsWith(`${m.prefix}/`),
  )
  if (!match) return null
  const features = await getTenantFeatures(currentTenant()?.slug)
  if (isModuleEnabled(match.module, features)) return null
  return NextResponse.json(
    { error: 'Este módulo no está disponible en tu plan.' },
    { status: 403 },
  )
}

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
  // Gate por plan del club (módulo desactivado ⇒ 403), tras validar rol.
  const gated = await assertModuleForRequest(request)
  if (gated) {
    return { ok: false as const, response: gated }
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
 * - COACH: solo equipos que entrena (GroupMembership role=COACH).
 * Devuelve una respuesta 403 si no procede, o `null` si tiene acceso.
 *
 * Cierra el gap por el que un COACH podía modificar la plantilla, horarios o
 * datos de equipos que no entrena (los endpoints solo exigían rol COACH).
 */
export async function assertTeamAccess(
  auth: { role: SessionRole; session: Session },
  groupId: string,
): Promise<NextResponse | null> {
  if (auth.role === 'ADMIN') return null
  if (auth.role === 'COACH') {
    const memberId = (auth.session.user as { memberId?: string | null } | undefined)?.memberId || null
    if (memberId) {
      const owns = await prisma.groupMembership.findFirst({
        where: { groupId, memberId, role: 'COACH' },
        select: { id: true },
      })
      if (owns) return null
    }
  }
  return NextResponse.json({ error: 'No tienes acceso a este equipo' }, { status: 403 })
}

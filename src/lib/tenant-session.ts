import { prisma } from '@/lib/prisma'
import { currentTenant } from '@/lib/multitenant/context'

type TenantBoundUser = { id?: string; tenant?: string | null } | null | undefined

/**
 * SEGURIDAD cross-tenant: ¿esta sesión pertenece al club (tenant) ACTIVO?
 *
 * El JWT lleva el claim `tenant`, ligado al club en el login/SSO. Si coincide con
 * el tenant activo (resuelto por host), la sesión vale. Un token de OTRO club
 * reenviado a este host (curl con Cookie/Bearer ajena) NO coincide → se rechaza.
 *
 * Tokens heredados sin claim (emitidos antes de este despliegue): se aceptan solo
 * si el usuario existe en la BD del club activo — un id de otro club no existirá
 * aquí (los ids son globalmente únicos). Fail-closed ante error de BD.
 *
 * Si no hay tenant activo (servicio portal / modo single-tenant), no aplica.
 *
 * Es el único punto de verdad; lo usan el callback `session` (auth.ts), la ruta
 * Bearer (session.ts) y requireRoles (rbac-api.ts), para que NINGUNA superficie de
 * autenticación (incluidas las self-auth: whatsapp/**, workflows/**, server
 * actions, etc.) acepte un token de otro club.
 */
export async function sessionMatchesActiveTenant(user: TenantBoundUser): Promise<boolean> {
  const activeSlug = currentTenant()?.slug || null
  if (!activeSlug) return true
  if (!user) return false
  const claim = (user.tenant ?? null) as string | null
  if (claim) return claim === activeSlug
  if (!user.id) return false
  try {
    const found = await prisma.user.findUnique({ where: { id: String(user.id) }, select: { id: true } })
    return Boolean(found)
  } catch {
    return false
  }
}

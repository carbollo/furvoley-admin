import { prisma } from '@/lib/prisma'
import { currentTenant } from '@/lib/multitenant/context'

type TenantBoundUser =
  | { id?: string; tenant?: string | null; authTime?: number }
  | null
  | undefined

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
  if (claim && claim !== activeSlug) return false
  if (!user.id) return false

  // Y además: ¿sigue viva esta sesión?
  //
  // Las sesiones son JWT y duran 30 días. Sin este corte, cambiar la contraseña
  // —el gesto de «me han robado el portátil»— no echaba a nadie, y quitarle el
  // rol a alguien o desactivarlo tampoco: seguía dentro casi un mes con los
  // permisos viejos. Ahora toda acción de contención avanza
  // `sessionsInvalidBefore` y cualquier sesión anterior deja de valer aquí, que
  // es el punto por el que pasan TODAS (incluidas las rutas que se autentican
  // por su cuenta).
  try {
    const found = await prisma.user.findUnique({
      where: { id: String(user.id) },
      select: { id: true, sessionsInvalidBefore: true },
    })
    if (!found) return false
    const corte = found.sessionsInvalidBefore
    if (corte) {
      const emitida = Number(user.authTime || 0)
      // Sin marca de emisión, la sesión es anterior a este cambio: se corta.
      if (!emitida || emitida < corte.getTime()) return false
    }
    return true
  } catch {
    return false
  }
}

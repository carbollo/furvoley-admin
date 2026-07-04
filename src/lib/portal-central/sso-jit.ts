import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { normalizeRole } from '@/lib/rbac'
import type { PortalSsoPayload } from '@/lib/portal-sso'

/**
 * Alta "just-in-time" del usuario en la BD del tenant a partir del token del
 * portal (Modelo C). El token trae el PortalUser (identidad + rol de acceso);
 * aquí materializamos su `User` local para que la sesión y los roles del CRM
 * funcionen. Devuelve el payload de sesión con el `User` REAL del tenant.
 *
 * Debe ejecutarse con el tenant ya activo (enterTenantFromRequest).
 */
export async function jitTenantUserSession(payload: PortalSsoPayload): Promise<PortalSsoPayload> {
  const email = String(payload.email || '').trim().toLowerCase()
  if (!email) throw new Error('Token SSO sin email.')

  const existing = await prisma.user.findUnique({ where: { email } })
  let user
  if (existing) {
    // Respeta el rol y memberId locales del tenant; solo completa el nombre si faltaba.
    user = existing.name || !payload.name
      ? existing
      : await prisma.user.update({ where: { id: existing.id }, data: { name: payload.name } })
  } else {
    // Contraseña aleatoria: el acceso va por SSO, no por contraseña local.
    const password = await bcrypt.hash(randomBytes(24).toString('hex'), 10)
    user = await prisma.user.create({
      data: {
        email,
        name: payload.name ?? null,
        role: normalizeRole(payload.role),
        password,
        mustChangePassword: false,
      },
    })
  }

  return {
    sub: user.id,
    email: user.email ?? email,
    name: user.name ?? payload.name ?? null,
    role: normalizeRole(user.role),
    memberId: user.memberId ?? null,
    mustChangePassword: user.mustChangePassword === true,
    exp: payload.exp,
    iss: payload.iss,
  }
}

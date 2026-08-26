import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { isPortalAdminConfigured, isPortalAdminRequest, getPortalAdminIdentity } from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { resetPortalUserPassword, logPortalAudit } from '@/lib/portal-central/portal-store'
import { clientIpFromHeaders } from '@/lib/login-rate-limit'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  if (!isPortalCentralHost()) return NextResponse.json({ error: 'Panel admin solo en el servicio portal.' }, { status: 404 })
  if (!isPortalAdminConfigured()) return NextResponse.json({ error: 'Define PORTAL_ADMIN_PASSWORD.' }, { status: 503 })
  if (!(await isPortalAdminRequest())) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  return null
}

/**
 * Reenviar acceso: genera una contraseña temporal para el admin del club (su
 * PortalUser ADMIN activo) y la devuelve UNA vez para que el super-admin se la
 * comunique. Entra por el portal (/portal). NO toca la BD del tenant.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { tenantId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const tenantId = String(body.tenantId || '').trim()
  if (!tenantId) return NextResponse.json({ error: 'Falta tenantId' }, { status: 400 })

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, name: true } })
  if (!tenant) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const adminUser = await prisma.portalUser.findFirst({
    where: { tenantId, role: 'ADMIN', status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  })
  if (!adminUser) {
    return NextResponse.json({ error: 'Este club no tiene un administrador activo en el portal.' }, { status: 404 })
  }

  // Contraseña temporal legible (12 chars, sin caracteres ambiguos).
  const tempPassword = randomBytes(9).toString('base64url').slice(0, 12)
  await resetPortalUserPassword(adminUser.id, tempPassword)

  await logPortalAudit({
    actor: (await getPortalAdminIdentity()) ?? 'super-admin',
    action: 'RESET_PASSWORD',
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    targetType: 'PORTAL_USER',
    targetId: adminUser.id,
    detail: { email: adminUser.email },
    ip: clientIpFromHeaders(request.headers),
  })

  return NextResponse.json({ ok: true, email: adminUser.email, tempPassword })
}

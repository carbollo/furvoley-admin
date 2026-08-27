import { NextResponse } from 'next/server'
import { isPortalAdminConfigured, isPortalAdminRequest, getPortalAdminIdentity } from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost, buildTenantSsoUrl } from '@/lib/portal-central/config'
import { createPortalSsoToken, getPortalSsoSecret } from '@/lib/portal-sso'
import { logPortalAudit } from '@/lib/portal-central/portal-store'
import { clientIpFromHeaders } from '@/lib/login-rate-limit'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  if (!isPortalCentralHost()) {
    return NextResponse.json({ error: 'Panel admin solo en el servicio portal.' }, { status: 404 })
  }
  if (!isPortalAdminConfigured()) {
    return NextResponse.json({ error: 'Define PORTAL_ADMIN_PASSWORD.' }, { status: 503 })
  }
  if (!(await isPortalAdminRequest())) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }
  return null
}

/**
 * "Entrar como" el admin de un club (soporte). Reutiliza el SSO del portal: el
 * secreto vive aquí, así que se mintea el mismo token que el login del dueño,
 * pero SIN contraseña — con la identidad del PortalUser ADMIN del club.
 *
 * Funciona incluso con el club SUSPENDIDO (no pasa por verifyPortalUser ni por
 * el gate de login por credenciales): el soporte debe poder entrar a arreglar.
 * Cada uso queda auditado.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const secret = getPortalSsoSecret()
  if (!secret) return NextResponse.json({ error: 'Falta PORTAL_SSO_SECRET.' }, { status: 503 })

  let body: { tenantId?: string; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const tenantId = String(body.tenantId || '').trim()
  if (!tenantId) return NextResponse.json({ error: 'Falta tenantId' }, { status: 400 })
  // Motivo obligatorio: "entrar como" accede a datos del club; el porqué queda
  // registrado en la auditoría (rendición de cuentas / RGPD).
  const reason = String(body.reason || '').trim().slice(0, 300)
  if (reason.length < 3) {
    return NextResponse.json({ error: 'Indica el motivo del acceso (mínimo 3 caracteres).' }, { status: 400 })
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true },
  })
  if (!tenant) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Se entra con la identidad de un admin del club (activo). Si no hay ninguno,
  // no se puede impersonar (habría que crear un usuario de acceso primero).
  const admin = await prisma.portalUser.findFirst({
    where: { tenantId: tenant.id, role: 'ADMIN', status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, name: true, role: true },
  })
  if (!admin) {
    return NextResponse.json(
      { error: 'El club no tiene un usuario administrador activo con el que entrar.' },
      { status: 409 },
    )
  }

  let redirectUrl: string
  try {
    const token = createPortalSsoToken(
      {
        userId: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        memberId: null,
        mustChangePassword: false,
      },
      secret,
      tenant.slug, // liga el token a este club
      { impersonated: true },
    )
    redirectUrl = buildTenantSsoUrl(tenant.slug, token)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo construir el acceso SSO.' },
      { status: 503 },
    )
  }

  await logPortalAudit({
    actor: (await getPortalAdminIdentity()) ?? 'super-admin',
    action: 'IMPERSONATE',
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    targetType: 'PORTAL_USER',
    targetId: admin.id,
    detail: { adminEmail: admin.email, reason },
    ip: clientIpFromHeaders(request.headers),
  })

  return NextResponse.json({ ok: true, redirectUrl })
}

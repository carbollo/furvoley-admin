import { NextResponse } from 'next/server'
import { isPortalAdminConfigured, isPortalAdminRequest } from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
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
 * Bandeja central de errores por club. Solo LEE la BD del portal (los errores los
 * escribe crm-mt). Ordena los no resueltos primero y por más reciente. Tolera que
 * la tabla no exista aún (primer deploy antes del db push del portal).
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const rows = await prisma.portalErrorLog.findMany({
      orderBy: [{ resolved: 'asc' }, { lastSeenAt: 'desc' }],
      take: 100,
    })
    const unresolved = rows.filter((r) => !r.resolved).length
    const clubs = new Set(rows.filter((r) => !r.resolved).map((r) => r.tenantSlug)).size

    return NextResponse.json({
      ok: true,
      summary: { unresolved, clubsAffected: clubs },
      errors: rows.map((r) => ({
        id: r.id,
        tenantSlug: r.tenantSlug,
        tenantName: r.tenantName,
        level: r.level,
        source: r.source,
        name: r.name,
        message: r.message,
        route: r.route,
        count: r.count,
        resolved: r.resolved,
        firstSeenAt: r.firstSeenAt.toISOString(),
        lastSeenAt: r.lastSeenAt.toISOString(),
      })),
    })
  } catch {
    return NextResponse.json({ ok: true, summary: { unresolved: 0, clubsAffected: 0 }, errors: [] })
  }
}

/** Marca un error como resuelto / sin resolver. */
export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { id?: string; resolved?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  try {
    await prisma.portalErrorLog.update({
      where: { id },
      data: { resolved: body.resolved !== false },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 400 })
  }
}

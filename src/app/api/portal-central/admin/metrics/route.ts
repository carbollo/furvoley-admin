import { NextResponse } from 'next/server'
import { isPortalAdminConfigured, isPortalAdminRequest } from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { computePortalBilling } from '@/lib/portal-central/portal-store'
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
 * Dashboard cross-club: devuelve el ÚLTIMO snapshot de KPIs (agregados + desglose
 * por club) y una serie histórica corta para las gráficas de tendencia. Solo LEE
 * la BD del portal; el snapshot lo genera el cron de crm-mt (no se calcula aquí).
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  // MRR/ARR: suma del precio mensual de los clubes ACTIVE (lectura directa de Tenant,
  // independiente del snapshot, así siempre está disponible).
  const billing = await computePortalBilling().catch(() => ({ mrr: 0, arr: 0, activeClubs: 0, trials: 0 }))

  try {
    const [latest, history] = await Promise.all([
      prisma.portalKpiSnapshot.findFirst({ orderBy: { createdAt: 'desc' } }),
      prisma.portalKpiSnapshot.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          createdAt: true,
          membersActive: true,
          membersTotal: true,
          incomeMonthTotal: true,
          pendingAmountTotal: true,
        },
      }),
    ])

    return NextResponse.json({
      ok: true,
      billing,
      latest: latest
        ? {
            createdAt: latest.createdAt.toISOString(),
            clubsTotal: latest.clubsTotal,
            clubsActive: latest.clubsActive,
            tenantsOk: latest.tenantsOk,
            tenantsFailed: latest.tenantsFailed,
            membersTotal: latest.membersTotal,
            membersActive: latest.membersActive,
            membersOverdue: latest.membersOverdue,
            incomeMonthTotal: latest.incomeMonthTotal,
            pendingCount: latest.pendingCount,
            pendingAmountTotal: latest.pendingAmountTotal,
            perClub: latest.perClub,
          }
        : null,
      history: history
        .slice()
        .reverse()
        .map((h) => ({
          at: h.createdAt.toISOString(),
          membersActive: h.membersActive,
          membersTotal: h.membersTotal,
          incomeMonthTotal: h.incomeMonthTotal,
          pendingAmountTotal: h.pendingAmountTotal,
        })),
    })
  } catch {
    // La tabla puede no existir aún (primer deploy antes del db push del portal),
    // o no haber ningún snapshot todavía. No es un error para el dashboard.
    return NextResponse.json({ ok: true, billing, latest: null, history: [] })
  }
}

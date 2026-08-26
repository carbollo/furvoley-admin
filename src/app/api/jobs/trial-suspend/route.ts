import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { logPortalAudit, NO_SUSPEND_TAG } from '@/lib/portal-central/portal-store'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Tarea programada (servicio PORTAL): suspende los clubes cuya PRUEBA ha caducado
 * (status ACTIVE y trialEndsAt en el pasado). Auth: Bearer CRON_SECRET. Diaria.
 * Opera sobre la BD del portal (prisma = portal), NO recorre tenants.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  if (!isPortalCentralHost()) {
    return NextResponse.json({ ok: true, skipped: 'no es el servicio portal' })
  }

  const now = new Date()
  const suspended: string[] = []
  const skipped: string[] = []
  try {
    const expired = await prisma.tenant.findMany({
      where: { status: 'ACTIVE', trialEndsAt: { not: null, lt: now } },
      select: { id: true, slug: true, name: true, trialEndsAt: true, tags: true },
    })
    for (const t of expired) {
      // La etiqueta `no-suspender` (case-insensitive) protege al club: p. ej. una
      // negociación o migración en curso que no debe cortarse al caducar la prueba.
      if ((t.tags || []).some((tag) => tag.trim().toLowerCase() === NO_SUSPEND_TAG)) {
        skipped.push(t.slug)
        continue
      }
      await prisma.tenant.update({ where: { id: t.id }, data: { status: 'SUSPENDED' } })
      await logPortalAudit({
        actor: 'cron',
        action: 'AUTO_SUSPEND_TRIAL',
        tenantSlug: t.slug,
        tenantName: t.name,
        targetType: 'TENANT',
        targetId: t.id,
        detail: { trialEndsAt: t.trialEndsAt?.toISOString() ?? null },
      })
      suspended.push(t.slug)
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, suspended, skipped, count: suspended.length })
}

export async function POST(request: Request) {
  return run(request)
}

export async function GET(request: Request) {
  return run(request)
}

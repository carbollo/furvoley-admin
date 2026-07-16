import { Client } from 'pg'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { forEachTenant } from '@/lib/multitenant/dispatch'
import { getMemberStatsAccurate } from '@/lib/crm-member-mapper'
import { logAppError } from '@/lib/error-log'

/**
 * Snapshot de KPIs cross-club para el dashboard del super-admin (Fase 1).
 *
 * Reparto de responsabilidades (Modelo C):
 * - Este módulo corre en crm-mt (único servicio con MULTITENANT=true y acceso a
 *   las BD tenant_*). `computeClubKpis` se ejecuta DENTRO de forEachTenant, así
 *   que `prisma` resuelve a la BD de cada club.
 * - El resultado agregado se ESCRIBE en la BD del PORTAL con un pg Client
 *   directo (no `prisma`: fuera de withTenant, en crm-mt, prisma lanzaría).
 * - El portal solo LEE la última fila (dashboard), nunca consulta en vivo.
 */

const PORTAL_DB_NAME = String(process.env.PORTAL_DB_NAME || 'portal').trim() || 'portal'

/** Connection string de la BD del portal (misma URL base, distinto pathname). */
function portalDbUrl(): string | null {
  const base = String(process.env.TENANT_DB_BASE_URL || '').trim()
  if (!base) return null
  const u = new URL(base)
  u.pathname = `/${PORTAL_DB_NAME}`
  return u.toString()
}

export type ClubKpis = {
  membersTotal: number
  membersActive: number
  membersOverdue: number
  incomeMonth: number
  pendingCount: number
  pendingAmount: number
}

export type ClubSnapshotRow = ClubKpis & {
  slug: string
  name: string
  ok: boolean
  error?: string
}

/**
 * KPIs de UN club. Debe llamarse dentro de forEachTenant/withTenant (entonces
 * `prisma` apunta a la BD del club). Misma lógica que la herramienta crm_get_kpis.
 */
export async function computeClubKpis(): Promise<ClubKpis> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  const memberStats = await getMemberStatsAccurate(prisma)
  const [pendingInvoices, incomeTxMonth] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { notIn: ['PAID', 'VOID'] } },
      select: { totalAmount: true, paidAmount: true },
    }),
    prisma.transaction.findMany({
      where: { type: 'INCOME', date: { gte: monthStart, lte: monthEnd } },
      select: { amount: true },
    }),
  ])
  const pendingAmount = pendingInvoices.reduce(
    (a, i) => a + Math.max(0, i.totalAmount - i.paidAmount),
    0,
  )
  const incomeMonth = incomeTxMonth.reduce((a, t) => a + t.amount, 0)

  return {
    membersTotal: memberStats.total,
    membersActive: memberStats.activos,
    membersOverdue: memberStats.morosos,
    incomeMonth: Number(incomeMonth.toFixed(2)),
    pendingCount: pendingInvoices.length,
    pendingAmount: Number(pendingAmount.toFixed(2)),
  }
}

/**
 * Recorre todos los clubes ACTIVE, calcula sus KPIs, agrega y guarda una fila
 * de snapshot en la BD del portal. Devuelve un resumen o null si no se pudo.
 * Nunca lanza por un club: forEachTenant captura el fallo por slug.
 */
export async function collectAndStoreSnapshot(): Promise<
  { id: string; clubsActive: number; membersTotal: number } | null
> {
  const url = portalDbUrl()
  if (!url) {
    console.error('[snapshot] Falta TENANT_DB_BASE_URL; no se puede escribir el snapshot.')
    return null
  }

  // 1) KPIs por club (forEachTenant solo recorre los ACTIVE).
  const results = await forEachTenant(() => computeClubKpis())

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    // 2) Nombres y totales de clubes desde el directorio del portal.
    const tRows = (
      await client.query('SELECT slug, name, status FROM "Tenant"')
    ).rows as { slug: string; name: string; status: string }[]
    const nameBySlug = new Map(tRows.map((t) => [t.slug, t.name]))
    const clubsTotal = tRows.length
    const clubsActive = tRows.filter((t) => t.status === 'ACTIVE').length

    const perClub: ClubSnapshotRow[] = results.map((r) => ({
      slug: r.slug,
      name: nameBySlug.get(r.slug) ?? r.slug,
      ok: r.ok,
      error: r.ok ? undefined : r.error,
      membersTotal: r.value?.membersTotal ?? 0,
      membersActive: r.value?.membersActive ?? 0,
      membersOverdue: r.value?.membersOverdue ?? 0,
      incomeMonth: r.value?.incomeMonth ?? 0,
      pendingCount: r.value?.pendingCount ?? 0,
      pendingAmount: r.value?.pendingAmount ?? 0,
    }))

    // Los clubes que no respondieron son un problema operativo (BD caída, etc.):
    // quedan reflejados en el snapshot, pero además los registramos como error
    // para que salgan en la bandeja del super-admin.
    for (const c of perClub.filter((x) => !x.ok)) {
      await logAppError({
        error: c.error || 'Fallo al agregar los KPIs del club',
        source: 'cron:snapshot',
        level: 'ERROR',
        slug: c.slug,
        context: { phase: 'snapshot-aggregation' },
      })
    }

    // 3) Agregados globales (solo sobre los clubes que respondieron bien).
    const ok = perClub.filter((c) => c.ok)
    const sum = (f: (c: ClubSnapshotRow) => number) => ok.reduce((a, c) => a + f(c), 0)
    const round = (n: number) => Number(n.toFixed(2))

    const id = randomUUID()
    await client.query(
      `INSERT INTO "PortalKpiSnapshot"
         ("id","createdAt","clubsTotal","clubsActive","tenantsOk","tenantsFailed",
          "membersTotal","membersActive","membersOverdue",
          "incomeMonthTotal","pendingCount","pendingAmountTotal","perClub")
       VALUES ($1, now(), $2,$3,$4,$5, $6,$7,$8, $9,$10,$11, $12)`,
      [
        id,
        clubsTotal,
        clubsActive,
        ok.length,
        perClub.length - ok.length,
        sum((c) => c.membersTotal),
        sum((c) => c.membersActive),
        sum((c) => c.membersOverdue),
        round(sum((c) => c.incomeMonth)),
        sum((c) => c.pendingCount),
        round(sum((c) => c.pendingAmount)),
        JSON.stringify(perClub),
      ],
    )
    return { id, clubsActive, membersTotal: sum((c) => c.membersTotal) }
  } finally {
    await client.end().catch(() => {})
  }
}

import { NextResponse } from 'next/server'
import { isPortalAdminConfigured, isPortalAdminRequest, getPortalAdminIdentity } from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { getProfitSplit, setProfitSplit, logPortalAudit, type ProfitSplit } from '@/lib/portal-central/portal-store'
import { clientIpFromHeaders } from '@/lib/login-rate-limit'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  if (!isPortalCentralHost()) return NextResponse.json({ error: 'Panel admin solo en el servicio portal.' }, { status: 404 })
  if (!isPortalAdminConfigured()) return NextResponse.json({ error: 'Define PORTAL_ADMIN_PASSWORD.' }, { status: 503 })
  if (!(await isPortalAdminRequest())) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  return null
}

/** Añade el porcentaje del otro lado (derivado) a la config. */
function withOther(s: ProfitSplit) {
  return { ok: true, selfPct: s.selfPct, otherPct: 100 - s.selfPct, selfLabel: s.selfLabel, otherLabel: s.otherLabel }
}

/** Config del reparto de beneficios del dashboard. */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return NextResponse.json(withOther(await getProfitSplit()))
}

/** Actualiza el reparto: `selfPct` (0-100), `selfLabel`, `otherLabel`. */
export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { selfPct?: unknown; selfLabel?: unknown; otherLabel?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const patch: Partial<ProfitSplit> = {}
  if (body.selfPct !== undefined) {
    const n = Number(body.selfPct)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return NextResponse.json({ error: 'El porcentaje debe ser un número entre 0 y 100.' }, { status: 400 })
    }
    patch.selfPct = n
  }
  if (body.selfLabel !== undefined) patch.selfLabel = String(body.selfLabel)
  if (body.otherLabel !== undefined) patch.otherLabel = String(body.otherLabel)

  let saved: ProfitSplit
  try {
    saved = await setProfitSplit(patch)
  } catch {
    // p. ej. la tabla PortalSetting aún no existe (ventana previa al db push del
    // primer arranque) o un fallo transitorio: respondemos JSON, no un 500 vacío.
    return NextResponse.json(
      { error: 'No se pudo guardar el reparto ahora mismo. Reinténtalo en un momento.' },
      { status: 503 },
    )
  }
  await logPortalAudit({
    actor: (await getPortalAdminIdentity()) || 'super-admin',
    action: 'UPDATE_PROFIT_SPLIT',
    targetType: 'SETTING',
    targetId: 'profit_split',
    detail: saved,
    ip: clientIpFromHeaders(request.headers),
  })
  return NextResponse.json(withOther(saved))
}

import { NextResponse } from 'next/server'
import { isPortalAdminConfigured, isPortalAdminRequest, getPortalAdminIdentity } from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { listPlans, createPlan, updatePlan, deletePlan, logPortalAudit, ensurePlanWebhookToken, regeneratePlanWebhookToken, ensurePlanWebhookSecret, regeneratePlanWebhookSecret } from '@/lib/portal-central/portal-store'
import { clientIpFromHeaders } from '@/lib/login-rate-limit'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  if (!isPortalCentralHost()) return NextResponse.json({ error: 'Panel admin solo en el servicio portal.' }, { status: 404 })
  if (!isPortalAdminConfigured()) return NextResponse.json({ error: 'Define PORTAL_ADMIN_PASSWORD.' }, { status: 503 })
  if (!(await isPortalAdminRequest())) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  return null
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    return NextResponse.json({ ok: true, plans: await listPlans() })
  } catch {
    return NextResponse.json({ ok: true, plans: [] })
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  try {
    const created = await createPlan({
      name: String(body.name || ''),
      priceMonthly: Number(body.priceMonthly),
      modules: body.modules,
      memberLimit: body.memberLimit,
    })
    await logPortalAudit({ actor: (await getPortalAdminIdentity()) ?? 'super-admin', action: 'CREATE_PLAN', targetType: 'PLAN', targetId: created.id, detail: { name: body.name }, ip: clientIpFromHeaders(request.headers) })
    return NextResponse.json({ ok: true, id: created.id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo crear el plan.' }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  // Generar / rotar el token del webhook de alta automática del plan.
  if (body.regenerateWebhook === true || body.ensureWebhook === true) {
    try {
      const token = body.regenerateWebhook === true
        ? await regeneratePlanWebhookToken(id)
        : await ensurePlanWebhookToken(id)
      if (!token) return NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 })
      await logPortalAudit({
        actor: (await getPortalAdminIdentity()) ?? 'super-admin',
        action: body.regenerateWebhook === true ? 'REGEN_PLAN_WEBHOOK' : 'ENSURE_PLAN_WEBHOOK',
        targetType: 'PLAN',
        targetId: id,
        ip: clientIpFromHeaders(request.headers),
      })
      return NextResponse.json({ ok: true, webhookToken: token })
    } catch {
      return NextResponse.json({ error: 'No se pudo generar el webhook del plan.' }, { status: 400 })
    }
  }

  // Activar / rotar el secreto HMAC de firma del webhook del plan.
  if (body.regenerateWebhookSecret === true || body.ensureWebhookSecret === true) {
    try {
      const secret = body.regenerateWebhookSecret === true
        ? await regeneratePlanWebhookSecret(id)
        : await ensurePlanWebhookSecret(id)
      if (!secret) return NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 })
      await logPortalAudit({
        actor: (await getPortalAdminIdentity()) ?? 'super-admin',
        action: body.regenerateWebhookSecret === true ? 'REGEN_PLAN_WEBHOOK_SECRET' : 'ENSURE_PLAN_WEBHOOK_SECRET',
        targetType: 'PLAN',
        targetId: id,
        ip: clientIpFromHeaders(request.headers),
      })
      return NextResponse.json({ ok: true, webhookSecret: secret })
    } catch {
      return NextResponse.json({ error: 'No se pudo generar el secreto del webhook.' }, { status: 400 })
    }
  }

  try {
    await updatePlan(id, {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...('priceMonthly' in body ? { priceMonthly: Number(body.priceMonthly) } : {}),
      ...('modules' in body ? { modules: body.modules } : {}),
      ...('memberLimit' in body ? { memberLimit: body.memberLimit } : {}),
    })
    await logPortalAudit({ actor: (await getPortalAdminIdentity()) ?? 'super-admin', action: 'UPDATE_PLAN', targetType: 'PLAN', targetId: id, ip: clientIpFromHeaders(request.headers) })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo actualizar el plan.' }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  try {
    await deletePlan(id)
    await logPortalAudit({ actor: (await getPortalAdminIdentity()) ?? 'super-admin', action: 'DELETE_PLAN', targetType: 'PLAN', targetId: id, ip: clientIpFromHeaders(request.headers) })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo eliminar el plan.' }, { status: 400 })
  }
}

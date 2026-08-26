import { NextResponse } from 'next/server'
import { isPortalAdminConfigured, isPortalAdminRequest, getPortalAdminIdentity } from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import {
  listPortalAdmins,
  createPortalAdmin,
  setPortalAdminStatus,
  resetPortalAdminPassword,
  logPortalAudit,
} from '@/lib/portal-central/portal-store'
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
    return NextResponse.json({ ok: true, admins: await listPortalAdmins() })
  } catch {
    return NextResponse.json({ ok: true, admins: [] })
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  let body: { email?: string; password?: string; name?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  try {
    const created = await createPortalAdmin({ email: String(body.email || ''), password: String(body.password || ''), name: body.name })
    await logPortalAudit({ actor: (await getPortalAdminIdentity()) ?? 'super-admin', action: 'CREATE_ADMIN', targetType: 'PORTAL_ADMIN', targetId: created.id, detail: { email: body.email }, ip: clientIpFromHeaders(request.headers) })
    return NextResponse.json({ ok: true, id: created.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo crear el super-admin.'
    // Prisma P2002 = email duplicado
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Ese email ya es super-admin.' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  let body: { id?: string; status?: string; password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const actor = (await getPortalAdminIdentity()) ?? 'super-admin'
  const ip = clientIpFromHeaders(request.headers)
  try {
    if (typeof body.password === 'string') {
      await resetPortalAdminPassword(id, body.password)
      await logPortalAudit({ actor, action: 'RESET_ADMIN_PASSWORD', targetType: 'PORTAL_ADMIN', targetId: id, ip })
      return NextResponse.json({ ok: true })
    }
    const status = String(body.status || '').toUpperCase()
    if (status !== 'ACTIVE' && status !== 'DISABLED') {
      return NextResponse.json({ error: 'Indica status (ACTIVE|DISABLED) o password.' }, { status: 400 })
    }
    await setPortalAdminStatus(id, status)
    await logPortalAudit({ actor, action: status === 'ACTIVE' ? 'ENABLE_ADMIN' : 'DISABLE_ADMIN', targetType: 'PORTAL_ADMIN', targetId: id, ip })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo actualizar el super-admin.' }, { status: 400 })
  }
}

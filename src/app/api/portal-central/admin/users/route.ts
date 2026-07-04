import { NextResponse } from 'next/server'
import { isPortalAdminConfigured, isPortalAdminRequest } from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import {
  createPortalUser,
  getTenantBySlug,
  listPortalUsers,
  resetPortalUserPassword,
  setPortalUserStatus,
} from '@/lib/portal-central/portal-store'

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

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return NextResponse.json({ ok: true, users: await listPortalUsers() })
}

/** Alta de un usuario de acceso adicional para un cliente existente. */
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { email?: string; password?: string; name?: string; role?: string; tenantSlug?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const tenant = await getTenantBySlug(String(body.tenantSlug || ''))
  if (!tenant) return NextResponse.json({ error: 'Cliente (subdominio) no encontrado.' }, { status: 404 })

  try {
    const user = await createPortalUser({
      email: String(body.email || ''),
      password: String(body.password || ''),
      name: body.name,
      role: body.role,
      tenantId: tenant.id,
    })
    return NextResponse.json({ ok: true, id: user.id })
  } catch (e: unknown) {
    if (typeof e === 'object' && e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Ese email ya está registrado.' }, { status: 409 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo crear el usuario.' }, { status: 400 })
  }
}

/** Activar/desactivar o resetear la contraseña de un usuario. */
export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { id?: string; status?: string; newPassword?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Falta el id del usuario.' }, { status: 400 })

  try {
    if (body.newPassword) {
      await resetPortalUserPassword(id, String(body.newPassword))
    } else if (body.status === 'ACTIVE' || body.status === 'DISABLED') {
      await setPortalUserStatus(id, body.status)
    } else {
      return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo actualizar.' }, { status: 400 })
  }
}

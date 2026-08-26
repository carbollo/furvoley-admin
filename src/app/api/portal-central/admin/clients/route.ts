import { NextResponse } from 'next/server'
import { isPortalAdminConfigured, isPortalAdminRequest, getPortalAdminIdentity } from '@/lib/portal-central/admin-auth'
import { isPortalCentralHost } from '@/lib/portal-central/config'
import { sanitizeSlug } from '@/lib/multitenant/registry'
import {
  assignPlanToTenant,
  createPortalUser,
  createTenant,
  getTenantBySlug,
  listTenants,
  logPortalAudit,
  setTenantFeatures,
  setTenantStatus,
  updateTenant,
} from '@/lib/portal-central/portal-store'
import { sanitizeFeatures } from '@/lib/crm-modules'
import { provisionTenant } from '@/lib/portal-central/provision'
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

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return NextResponse.json({ ok: true, tenants: await listTenants() })
}

/**
 * Actualiza un club: suspender/reactivar (`status`) o sus módulos activados
 * (`features`, feature flags del plan). Suspendido = sus usuarios no pueden
 * entrar por credenciales (gate en el login del CRM) y el club desaparece del
 * dashboard y de la agregación de errores. El soporte puede seguir entrando con
 * "entrar como". Cambiar `features` oculta/muestra secciones en el CRM del club.
 */
export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: {
    id?: string
    status?: string
    features?: unknown
    planId?: string | null
    name?: string
    priceMonthly?: number | null
    trialEndsAt?: string | null
    memberLimit?: number | null
    notes?: string | null
    tags?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { slug: true, name: true } })
  if (!tenant) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const ip = clientIpFromHeaders(request.headers)
  const actor = (await getPortalAdminIdentity()) ?? 'super-admin'

  // Cambio de módulos (feature flags).
  if (body.features !== undefined) {
    const features = sanitizeFeatures(body.features)
    await setTenantFeatures(id, features)
    await logPortalAudit({ actor, action: 'UPDATE_FEATURES', tenantSlug: tenant.slug, tenantName: tenant.name, targetType: 'TENANT', targetId: id, detail: features, ip })
    return NextResponse.json({ ok: true, features })
  }

  // Asignar / quitar plan (deriva features, precio y límite).
  if ('planId' in body) {
    try {
      await assignPlanToTenant(id, body.planId ? String(body.planId) : null)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo asignar el plan.' }, { status: 400 })
    }
    await logPortalAudit({ actor, action: 'ASSIGN_PLAN', tenantSlug: tenant.slug, tenantName: tenant.name, targetType: 'TENANT', targetId: id, detail: { planId: body.planId ?? null }, ip })
    return NextResponse.json({ ok: true })
  }

  // Edición de campos del club (nombre, precio, prueba, límite). Slug inmutable.
  const hasFieldEdit =
    typeof body.name === 'string' ||
    'priceMonthly' in body ||
    'trialEndsAt' in body ||
    'memberLimit' in body ||
    'notes' in body ||
    'tags' in body
  if (hasFieldEdit) {
    let trial: Date | null | undefined
    if ('trialEndsAt' in body) {
      if (!body.trialEndsAt) trial = null
      else {
        const d = new Date(body.trialEndsAt)
        if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Fecha de prueba no válida.' }, { status: 400 })
        trial = d
      }
    }
    await updateTenant(id, {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...('priceMonthly' in body ? { priceMonthly: body.priceMonthly ?? null } : {}),
      ...('trialEndsAt' in body ? { trialEndsAt: trial } : {}),
      ...('memberLimit' in body ? { memberLimit: body.memberLimit ?? null } : {}),
      ...('notes' in body ? { notes: body.notes ?? null } : {}),
      ...('tags' in body ? { tags: body.tags } : {}),
    })
    await logPortalAudit({ actor, action: 'UPDATE_CLIENT', tenantSlug: tenant.slug, tenantName: tenant.name, targetType: 'TENANT', targetId: id, detail: { name: body.name, priceMonthly: body.priceMonthly, trialEndsAt: body.trialEndsAt, memberLimit: body.memberLimit, ...('notes' in body ? { notes: true } : {}), ...('tags' in body ? { tags: body.tags } : {}) }, ip })
    return NextResponse.json({ ok: true })
  }

  // Cambio de estado (suspender / reactivar).
  const status = String(body.status || '').toUpperCase()
  if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
    return NextResponse.json({ error: 'Indica status, features, planId o campos a editar.' }, { status: 400 })
  }
  await setTenantStatus(id, status)
  await logPortalAudit({ actor, action: status === 'SUSPENDED' ? 'SUSPEND' : 'REACTIVATE', tenantSlug: tenant.slug, tenantName: tenant.name, targetType: 'TENANT', targetId: id, ip })
  return NextResponse.json({ ok: true, status })
}

/**
 * Crear cliente = desplegar su CRM (Modelo C):
 *   1. valida slug/email libres
 *   2. crea el Tenant en el directorio del portal
 *   3. aprovisiona su BD (CREATE DATABASE + esquema + admin)
 *   4. registra el usuario de acceso (admin del club)
 * Si el aprovisionamiento falla, se revierte el Tenant.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  if (!String(process.env.TENANT_DB_BASE_URL || '').trim()) {
    return NextResponse.json(
      { error: 'Falta TENANT_DB_BASE_URL en el portal (URL del servidor Postgres compartido).' },
      { status: 503 },
    )
  }

  let body: { name?: string; slug?: string; adminEmail?: string; adminPassword?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  const slug = sanitizeSlug(body.slug || body.name)
  const adminEmail = String(body.adminEmail || '').trim().toLowerCase()
  const adminPassword = String(body.adminPassword || '')

  if (!name) return NextResponse.json({ error: 'El nombre del club es obligatorio.' }, { status: 400 })
  if (!slug) return NextResponse.json({ error: 'No se pudo derivar un subdominio válido del nombre. Indica un slug.' }, { status: 400 })
  if (!adminEmail.includes('@')) return NextResponse.json({ error: 'Email del administrador no válido.' }, { status: 400 })
  if (adminPassword.length < 8) return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 })

  if (await getTenantBySlug(slug)) {
    return NextResponse.json({ error: `Ya existe un cliente con el subdominio «${slug}».` }, { status: 409 })
  }
  const emailTaken = await prisma.portalUser.findUnique({ where: { email: adminEmail } })
  if (emailTaken) {
    return NextResponse.json({ error: 'Ese email ya está usado por otro usuario del portal.' }, { status: 409 })
  }

  const tenant = await createTenant({ slug, name })

  // Aprovisiona la BD del cliente; si falla, revierte el Tenant.
  const result = await provisionTenant({ slug, adminEmail, adminPassword })
  if (!result.ok) {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {})
    return NextResponse.json(
      { error: 'No se pudo aprovisionar la base de datos del cliente.', log: result.output.slice(-1500) },
      { status: 500 },
    )
  }

  await createPortalUser({ email: adminEmail, password: adminPassword, name, role: 'ADMIN', tenantId: tenant.id })

  await logPortalAudit({
    actor: (await getPortalAdminIdentity()) ?? 'super-admin',
    action: 'CREATE_CLIENT',
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    targetType: 'TENANT',
    targetId: tenant.id,
    detail: { adminEmail },
    ip: clientIpFromHeaders(request.headers),
  })

  return NextResponse.json({
    ok: true,
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    admin: adminEmail,
  })
}

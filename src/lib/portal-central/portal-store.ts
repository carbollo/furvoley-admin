import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { sanitizeSlug } from '@/lib/multitenant/registry'

/**
 * Directorio del portal (Modelo C) sobre la BD del propio portal:
 * clientes (`Tenant`) y usuarios de acceso (`PortalUser`). Solo se usa en el
 * servicio portal (PORTAL_CENTRAL_HOST=true), donde `prisma` apunta a su
 * DATABASE_URL (MULTITENANT desactivado).
 */

export type TenantRow = {
  id: string
  slug: string
  name: string
  status: string
  createdAt: string
  userCount: number
}

export type PortalUserRow = {
  id: string
  email: string
  name: string
  role: string
  status: string
  tenantId: string
  tenantSlug: string
  tenantName: string
  createdAt: string
}

export async function listTenants(): Promise<TenantRow[]> {
  const rows = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { users: true } } },
  })
  return rows.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    userCount: t._count.users,
  }))
}

export async function getTenantBySlug(slug: string) {
  const clean = sanitizeSlug(slug)
  if (!clean) return null
  return prisma.tenant.findUnique({ where: { slug: clean } })
}

export async function createTenant(input: { slug: string; name: string }) {
  const slug = sanitizeSlug(input.slug)
  if (!slug) throw new Error('Slug no válido (usa letras, números y guiones).')
  const name = String(input.name || '').trim() || slug
  return prisma.tenant.create({ data: { slug, name } })
}

export async function setTenantStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
  return prisma.tenant.update({ where: { id }, data: { status } })
}

export async function listPortalUsers(): Promise<PortalUserRow[]> {
  const rows = await prisma.portalUser.findMany({
    orderBy: { createdAt: 'desc' },
    include: { tenant: { select: { slug: true, name: true } } },
    take: 1000,
  })
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name || '',
    role: u.role,
    status: u.status,
    tenantId: u.tenantId,
    tenantSlug: u.tenant.slug,
    tenantName: u.tenant.name,
    createdAt: u.createdAt.toISOString(),
  }))
}

export async function createPortalUser(input: {
  email: string
  password: string
  name?: string
  role?: string
  tenantId: string
}) {
  const email = String(input.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) throw new Error('Email no válido.')
  const password = String(input.password || '')
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
  const role = ['ADMIN', 'COACH', 'TREASURER', 'MEMBER'].includes(String(input.role || '').toUpperCase())
    ? String(input.role).toUpperCase()
    : 'ADMIN'
  const passwordHash = await bcrypt.hash(password, 10)
  return prisma.portalUser.create({
    data: { email, passwordHash, name: input.name?.trim() || null, role, tenantId: input.tenantId },
  })
}

export async function setPortalUserStatus(id: string, status: 'ACTIVE' | 'DISABLED') {
  return prisma.portalUser.update({ where: { id }, data: { status } })
}

export async function resetPortalUserPassword(id: string, newPassword: string) {
  const password = String(newPassword || '')
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
  const passwordHash = await bcrypt.hash(password, 10)
  return prisma.portalUser.update({ where: { id }, data: { passwordHash } })
}

export type PortalAuditInput = {
  actor?: string
  action: string
  tenantSlug?: string | null
  tenantName?: string | null
  targetType?: string | null
  targetId?: string | null
  detail?: unknown
  ip?: string | null
}

/** Registra una acción del super-admin. Best-effort: nunca tumba la acción. */
export async function logPortalAudit(input: PortalAuditInput) {
  try {
    await prisma.portalAuditLog.create({
      data: {
        actor: input.actor ?? 'super-admin',
        action: input.action,
        tenantSlug: input.tenantSlug ?? null,
        tenantName: input.tenantName ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        detail: (input.detail ?? undefined) as never,
        ip: input.ip ?? null,
      },
    })
  } catch (e) {
    console.warn('[portal-audit] no se pudo registrar la acción:', e instanceof Error ? e.message : e)
  }
}

export type PortalAuditRow = {
  id: string
  actor: string
  action: string
  tenantSlug: string | null
  tenantName: string | null
  detail: unknown
  ip: string | null
  createdAt: string
}

export async function listPortalAuditLogs(): Promise<PortalAuditRow[]> {
  const rows = await prisma.portalAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  return rows.map((r) => ({
    id: r.id,
    actor: r.actor,
    action: r.action,
    tenantSlug: r.tenantSlug,
    tenantName: r.tenantName,
    detail: r.detail,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
  }))
}

/** Verifica credenciales para el login central (Paso 4). */
export async function verifyPortalUser(rawEmail: string, password: string) {
  const email = String(rawEmail || '').trim().toLowerCase()
  if (!email || !password) return null
  const user = await prisma.portalUser.findUnique({
    where: { email },
    include: { tenant: true },
  })
  if (!user || user.status !== 'ACTIVE') return null
  if (user.tenant.status !== 'ACTIVE') return null
  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return null
  return { user, tenant: user.tenant }
}

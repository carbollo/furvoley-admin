import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { isSingleEmail } from '@/lib/db-input-validation'
import {
  createTenant,
  createPortalUser,
  assignPlanToTenant,
  getTenantBySlug,
  setTenantStatus,
  addTenantTag,
  removeTenantTag,
} from '@/lib/portal-central/portal-store'
import { provisionTenant } from '@/lib/portal-central/provision'

/** Etiqueta que marca a un club con un pago fallido (impago) desde el webhook. */
export const IMPAGO_TAG = 'impago'

// Subdominios reservados (los rechaza sanitizeSlug en registry.ts): no valen como club.
const RESERVED_SLUGS = new Set(['www', 'app', 'portal', 'acceso', 'login', 'admin', 'api', 'static', 'assets'])

// Emails con un alta EN CURSO (guard TOCTOU): un reintento mientras se aprovisiona
// no debe recibir "idempotente OK" (si el original falla y revierte, se perdería el
// club en silencio); se le responde "reintenta". Set en memoria (proceso único).
declare global {
  // eslint-disable-next-line no-var
  var __provisioningEmails: Set<string> | undefined
}
const provisioning = globalThis.__provisioningEmails ?? new Set<string>()
globalThis.__provisioningEmails = provisioning

function slugify(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD') // separa acentos; el filtro alfanumérico de abajo los elimina
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 40)
}

async function uniqueSlug(base: string): Promise<string> {
  let root = slugify(base)
  if (root.length < 2 || RESERVED_SLUGS.has(root)) {
    root = `club-${randomBytes(3).toString('hex')}`
  }
  let slug = root
  let n = 1
  while (await getTenantBySlug(slug)) {
    n += 1
    slug = `${root}-${n}`.slice(0, 48)
    if (n > 50) {
      slug = `${root}-${randomBytes(3).toString('hex')}`.slice(0, 48)
      break
    }
  }
  return slug
}

/** Contraseña aleatoria de `len` caracteres (por defecto 24), sin caracteres ambiguos. */
export function randomPassword(len = 24): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

async function readExistingByEmail(email: string) {
  return prisma.portalUser.findUnique({
    where: { email },
    include: { tenant: { select: { slug: true, name: true } } },
  })
}

export type ProvisionResult =
  | { ok: true; pending: true }
  | { ok: true; alreadyProvisioned: true; tenantSlug: string; tenantName: string; email: string }
  | {
      ok: true
      alreadyProvisioned: false
      tenantId: string
      tenantSlug: string
      tenantName: string
      email: string
      password: string
    }
  | { ok: false; error: string; log?: string }

/**
 * Da de alta un club NUEVO completo a partir de una suscripción de tienda externa:
 * Tenant + BD aislada + usuario admin (email del evento + contraseña de 24 chars) +
 * plan asignado. Idempotente por email; guard TOCTOU para reintentos en vuelo; el
 * plan se asigna ANTES del aprovisionamiento pesado y todo se revierte si algo falla.
 */
export async function provisionClubFromSubscription(input: {
  planId: string
  email: string
  clubName?: string | null
}): Promise<ProvisionResult> {
  const email = String(input.email || '').trim().toLowerCase()
  if (!isSingleEmail(email)) {
    return { ok: false, error: 'El evento no incluye un email válido (una sola dirección, sin comas ni espacios).' }
  }
  if (!String(process.env.TENANT_DB_BASE_URL || '').trim()) {
    return { ok: false, error: 'Falta TENANT_DB_BASE_URL en el portal (servidor Postgres compartido).' }
  }

  // Guard TOCTOU: si ya hay un alta EN CURSO para este email, no declares idempotencia
  // (el original podría fallar y revertir): pide reintento. `has`+`add` son síncronos
  // (Node monohilo) → sin carrera entre ambos.
  if (provisioning.has(email)) return { ok: true, pending: true }
  provisioning.add(email)
  try {
    // Vía rápida ante reentrega ya COMPLETADA (usuario existe y no está en curso).
    const already = await readExistingByEmail(email)
    if (already) {
      return { ok: true, alreadyProvisioned: true, tenantSlug: already.tenant?.slug ?? '', tenantName: already.tenant?.name ?? '', email }
    }

    const clubName = (input.clubName || '').trim().slice(0, 120) || `Club ${email.split('@')[0]}`
    const slug = await uniqueSlug(input.clubName || email.split('@')[0])
    const password = randomPassword(24)

    const tenant = await createTenant({ slug, name: clubName })

    // Reclama el email atómicamente (backstop @unique) ANTES de nada pesado.
    let portalUserId: string
    try {
      const pu = await createPortalUser({ email, password, name: clubName, role: 'ADMIN', tenantId: tenant.id })
      portalUserId = pu.id
    } catch (e) {
      await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {})
      if (isUniqueViolation(e)) {
        const other = await readExistingByEmail(email)
        return { ok: true, alreadyProvisioned: true, tenantSlug: other?.tenant?.slug ?? '', tenantName: other?.tenant?.name ?? '', email }
      }
      return { ok: false, error: e instanceof Error ? e.message : 'No se pudo crear el usuario del club.' }
    }

    // Asigna el plan ANTES del aprovisionamiento pesado (evita clubes con planId=null
    // si esto fallara después). Rollback completo si falla.
    try {
      await assignPlanToTenant(tenant.id, input.planId)
    } catch {
      await prisma.portalUser.delete({ where: { id: portalUserId } }).catch(() => {})
      await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {})
      return { ok: false, error: 'No se pudo asignar el plan al club (¿plan eliminado?).' }
    }

    const result = await provisionTenant({ slug, adminEmail: email, adminPassword: password })
    if (!result.ok) {
      await prisma.portalUser.delete({ where: { id: portalUserId } }).catch(() => {})
      await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {})
      return { ok: false, error: 'No se pudo aprovisionar la base de datos del club.', log: result.output.slice(-1200) }
    }

    return {
      ok: true,
      alreadyProvisioned: false,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      email,
      password,
    }
  } finally {
    provisioning.delete(email)
  }
}

// ── Eventos "ligeros" del webhook sobre un club YA existente ──────────────────
// (cambio de plan / cancelación / impago). No aprovisionan nada: solo tocan la
// BD del portal, así que no pasan por el semáforo de concurrencia.

export type ClubActionResult =
  | { ok: true; found: true; tenantSlug: string; tenantName: string }
  | { ok: true; found: false }
  | { ok: false; error: string }

/** Busca el Tenant del club por el email de su usuario ADMIN (idempotencia por email). */
async function findClubByEmail(rawEmail: string) {
  const email = String(rawEmail || '').trim().toLowerCase()
  if (!isSingleEmail(email)) return null
  const pu = await prisma.portalUser.findUnique({
    where: { email },
    include: { tenant: { select: { id: true, slug: true, name: true, status: true } } },
  })
  return pu?.tenant ?? null
}

/**
 * Cambio de plan (upgrade/downgrade): **solo** reasigna el plan (features/precio/límite).
 * NO toca el estado ni la etiqueta `impago`: `subscription.updated` lo emiten muchas
 * tiendas por cualquier cambio (tarjeta, metadata…), no implica un pago. Reactivar y
 * limpiar impago es responsabilidad exclusiva de `payment_ok`.
 */
export async function changeClubPlan(email: string, planId: string): Promise<ClubActionResult> {
  const tenant = await findClubByEmail(email)
  if (!tenant) return { ok: true, found: false }
  try {
    await assignPlanToTenant(tenant.id, planId)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo cambiar el plan del club.' }
  }
  return { ok: true, found: true, tenantSlug: tenant.slug, tenantName: tenant.name }
}

/** Cancelación de la suscripción: suspende el club (conserva su BD y sus datos). */
export async function cancelClub(email: string): Promise<ClubActionResult> {
  const tenant = await findClubByEmail(email)
  if (!tenant) return { ok: true, found: false }
  if (tenant.status !== 'SUSPENDED') await setTenantStatus(tenant.id, 'SUSPENDED')
  return { ok: true, found: true, tenantSlug: tenant.slug, tenantName: tenant.name }
}

/** Pago fallido: marca el club con la etiqueta `impago` (no lo suspende: eso lo
 *  decide el super-admin o un futuro dunning). */
export async function markClubPaymentFailed(email: string): Promise<ClubActionResult> {
  const tenant = await findClubByEmail(email)
  if (!tenant) return { ok: true, found: false }
  await addTenantTag(tenant.id, IMPAGO_TAG)
  return { ok: true, found: true, tenantSlug: tenant.slug, tenantName: tenant.name }
}

/** Pago recuperado/renovación: quita `impago` y reactiva si estaba suspendido. */
export async function markClubPaymentOk(email: string): Promise<ClubActionResult> {
  const tenant = await findClubByEmail(email)
  if (!tenant) return { ok: true, found: false }
  await removeTenantTag(tenant.id, IMPAGO_TAG)
  if (tenant.status !== 'ACTIVE') await setTenantStatus(tenant.id, 'ACTIVE')
  return { ok: true, found: true, tenantSlug: tenant.slug, tenantName: tenant.name }
}

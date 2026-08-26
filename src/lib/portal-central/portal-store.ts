import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { isSingleEmail } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { sanitizeSlug } from '@/lib/multitenant/registry'
import { sanitizeFeatures, CRM_MODULES, type CrmModuleId, type TenantFeatures } from '@/lib/crm-modules'

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
  features: TenantFeatures
  createdAt: string
  userCount: number
  planId: string | null
  planName: string | null
  priceMonthly: number | null
  trialEndsAt: string | null
  memberLimit: number | null
  notes: string | null
  tags: string[]
}

/** Etiqueta que excluye a un club del cron de suspensión de pruebas. */
export const NO_SUSPEND_TAG = 'no-suspender'

/** Sanea la lista de etiquetas: trim, sin vacías, sin duplicados, tope de tamaño. */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const t = String(raw ?? '').trim().slice(0, 30)
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= 12) break
  }
  return out
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
    include: { _count: { select: { users: true } }, plan: { select: { name: true } } },
  })
  return rows.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: t.status,
    features: sanitizeFeatures(t.features),
    createdAt: t.createdAt.toISOString(),
    userCount: t._count.users,
    planId: t.planId ?? null,
    planName: t.plan?.name ?? null,
    priceMonthly: t.priceMonthly ?? null,
    trialEndsAt: t.trialEndsAt ? t.trialEndsAt.toISOString() : null,
    memberLimit: t.memberLimit ?? null,
    notes: t.notes ?? null,
    tags: Array.isArray(t.tags) ? t.tags : [],
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
  // Tope de longitud (como updateTenant): un `name` sin acotar del webhook podría
  // ser de varios MB y persistirse entero.
  const name = String(input.name || '').trim().slice(0, 120) || slug
  return prisma.tenant.create({ data: { slug, name } })
}

export async function setTenantStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
  return prisma.tenant.update({ where: { id }, data: { status } })
}

/**
 * Añade una etiqueta a un club de forma **atómica** (un solo UPDATE con guard
 * case-insensitive), para no perder escrituras si llegan dos eventos del webhook a
 * la vez (p. ej. `payment_failed` y `payment_ok`). No enforce el tope de 12 tags:
 * es para flags de sistema como `impago`, que siempre deben poder marcarse.
 */
export async function addTenantTag(id: string, tag: string) {
  const clean = normalizeTags([tag])[0]
  if (!clean) return
  await prisma.$executeRaw`
    UPDATE "Tenant"
    SET tags = array_append(tags, ${clean})
    WHERE id = ${id}
      AND NOT EXISTS (SELECT 1 FROM unnest(tags) AS t WHERE lower(t) = lower(${clean}))
  `
}

/** Quita una etiqueta de un club de forma **atómica** (case-insensitive). */
export async function removeTenantTag(id: string, tag: string) {
  const low = String(tag).trim().toLowerCase()
  if (!low) return
  await prisma.$executeRaw`
    UPDATE "Tenant"
    SET tags = ARRAY(SELECT t FROM unnest(tags) AS t WHERE lower(t) <> ${low})
    WHERE id = ${id}
  `
}

/** Guarda los módulos activados de un club (feature flags). */
export async function setTenantFeatures(id: string, features: TenantFeatures) {
  const clean = sanitizeFeatures(features)
  return prisma.tenant.update({ where: { id }, data: { features: clean as never } })
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
  if (!isSingleEmail(email)) throw new Error('Email no válido (una sola dirección, sin comas ni espacios).')
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

export async function listPortalAuditLogs(opts?: {
  action?: string
  tenantSlug?: string
  limit?: number
}): Promise<PortalAuditRow[]> {
  const where: Record<string, unknown> = {}
  if (opts?.action) where.action = opts.action
  if (opts?.tenantSlug) where.tenantSlug = opts.tenantSlug
  const take = Math.min(1000, Math.max(1, Math.trunc(opts?.limit ?? 200)))
  const rows = await prisma.portalAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take })
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

// ── FASE 1: Planes comerciales (editables) + facturación ─────────────────────

export type PlanRow = {
  id: string
  name: string
  priceMonthly: number
  modules: CrmModuleId[]
  memberLimit: number | null
  tenantCount: number
  webhookToken: string | null
  webhookSecret: string | null
}

/** Token aleatorio (48 hex) para la URL del webhook de alta automática de un plan. */
function newWebhookToken(): string {
  return randomBytes(24).toString('hex')
}

/** Secreto aleatorio (64 hex) para firmar el cuerpo del webhook (HMAC-SHA256). */
function newWebhookSecret(): string {
  return randomBytes(32).toString('hex')
}

function normalizePlanModules(input: unknown): CrmModuleId[] {
  const valid = new Set(CRM_MODULES.map((m) => m.id))
  if (!Array.isArray(input)) return []
  const out: CrmModuleId[] = []
  for (const raw of input) {
    const id = String(raw)
    if (valid.has(id as CrmModuleId) && !out.includes(id as CrmModuleId)) out.push(id as CrmModuleId)
  }
  return out
}

function normalizeLimit(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function listPlans(): Promise<PlanRow[]> {
  const rows = await prisma.plan.findMany({
    orderBy: [{ priceMonthly: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { tenants: true } } },
  })
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    priceMonthly: p.priceMonthly,
    modules: normalizePlanModules(p.modules),
    memberLimit: p.memberLimit ?? null,
    tenantCount: p._count.tenants,
    webhookToken: p.webhookToken ?? null,
    webhookSecret: p.webhookSecret ?? null,
  }))
}

export async function createPlan(input: { name: string; priceMonthly?: number; modules?: unknown; memberLimit?: unknown }) {
  const name = String(input.name || '').trim()
  if (!name) throw new Error('El nombre del plan es obligatorio.')
  const price = Number(input.priceMonthly)
  return prisma.plan.create({
    data: {
      name: name.slice(0, 80),
      priceMonthly: Number.isFinite(price) && price >= 0 ? price : 0,
      modules: normalizePlanModules(input.modules) as never,
      memberLimit: normalizeLimit(input.memberLimit),
      // Cada plan nace con su token de webhook de alta automática.
      webhookToken: newWebhookToken(),
    },
    select: { id: true },
  })
}

export async function updatePlan(id: string, patch: { name?: string; priceMonthly?: number; modules?: unknown; memberLimit?: unknown }) {
  const data: Record<string, unknown> = {}
  if (typeof patch.name === 'string' && patch.name.trim()) data.name = patch.name.trim().slice(0, 80)
  if (patch.priceMonthly !== undefined) {
    const price = Number(patch.priceMonthly)
    data.priceMonthly = Number.isFinite(price) && price >= 0 ? price : 0
  }
  if (patch.modules !== undefined) data.modules = normalizePlanModules(patch.modules) as never
  if (patch.memberLimit !== undefined) data.memberLimit = normalizeLimit(patch.memberLimit)
  if (Object.keys(data).length === 0) return null
  return prisma.plan.update({ where: { id }, data })
}

export async function deletePlan(id: string) {
  // onDelete: SetNull deja los clubes sin plan (conservan precio/límite ya fijados).
  return prisma.plan.delete({ where: { id } })
}

// ── Webhooks de alta automática por plan ─────────────────────────────────────

/** Genera el token de webhook del plan si aún no tiene; devuelve el token vigente. */
export async function ensurePlanWebhookToken(id: string): Promise<string | null> {
  const plan = await prisma.plan.findUnique({ where: { id }, select: { webhookToken: true } })
  if (!plan) return null
  if (plan.webhookToken) return plan.webhookToken
  const token = newWebhookToken()
  await prisma.plan.update({ where: { id }, data: { webhookToken: token } })
  return token
}

/** Rota el token del webhook (invalida la URL anterior). */
export async function regeneratePlanWebhookToken(id: string): Promise<string | null> {
  const token = newWebhookToken()
  const updated = await prisma.plan.update({ where: { id }, data: { webhookToken: token } }).catch(() => null)
  return updated ? token : null
}

/** Busca el plan por su token de webhook (para el handler del webhook). */
export async function findPlanByWebhookToken(token: string) {
  const clean = String(token || '').trim()
  if (!clean) return null
  return prisma.plan.findUnique({ where: { webhookToken: clean } })
}

/** Genera el secreto HMAC del plan si no tiene; devuelve el vigente (activa la firma). */
export async function ensurePlanWebhookSecret(id: string): Promise<string | null> {
  const plan = await prisma.plan.findUnique({ where: { id }, select: { webhookSecret: true } })
  if (!plan) return null
  if (plan.webhookSecret) return plan.webhookSecret
  const secret = newWebhookSecret()
  await prisma.plan.update({ where: { id }, data: { webhookSecret: secret } })
  return secret
}

/** Rota el secreto HMAC del plan (invalida las firmas hechas con el anterior). */
export async function regeneratePlanWebhookSecret(id: string): Promise<string | null> {
  const secret = newWebhookSecret()
  const updated = await prisma.plan.update({ where: { id }, data: { webhookSecret: secret } }).catch(() => null)
  return updated ? secret : null
}

/** Asigna (o quita) un plan a un club: deriva features, precio y límite. */
export async function assignPlanToTenant(tenantId: string, planId: string | null) {
  if (!planId) {
    return prisma.tenant.update({ where: { id: tenantId }, data: { planId: null } })
  }
  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan) throw new Error('Plan no encontrado.')
  const included = new Set(normalizePlanModules(plan.modules))
  // features: solo se guardan desactivaciones (ausente = activado).
  const features: TenantFeatures = {}
  for (const m of CRM_MODULES) {
    if (!included.has(m.id)) features[m.id] = false
  }
  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      planId: plan.id,
      priceMonthly: plan.priceMonthly,
      memberLimit: plan.memberLimit ?? null,
      features: sanitizeFeatures(features) as never,
    },
  })
}

/** Edita campos sueltos de un club (nombre/precio/prueba/límite). Slug inmutable. */
export async function updateTenant(id: string, patch: {
  name?: string
  priceMonthly?: number | null
  trialEndsAt?: Date | null
  memberLimit?: number | null
  notes?: string | null
  tags?: unknown
}) {
  const data: Record<string, unknown> = {}
  if (typeof patch.name === 'string' && patch.name.trim()) data.name = patch.name.trim().slice(0, 120)
  if ('priceMonthly' in patch) {
    // Mismo clamp >= 0 que createPlan/updatePlan: nunca un precio negativo (que
    // restaría del MRR). null = sin precio.
    const price = Number(patch.priceMonthly)
    data.priceMonthly = patch.priceMonthly == null ? null : (Number.isFinite(price) && price >= 0 ? price : 0)
  }
  if ('trialEndsAt' in patch) data.trialEndsAt = patch.trialEndsAt ?? null
  if ('memberLimit' in patch) data.memberLimit = normalizeLimit(patch.memberLimit)
  if ('notes' in patch) {
    const n = patch.notes == null ? '' : String(patch.notes).trim().slice(0, 2000)
    data.notes = n || null
  }
  if ('tags' in patch) data.tags = normalizeTags(patch.tags)
  if (Object.keys(data).length === 0) return null
  return prisma.tenant.update({ where: { id }, data })
}

/**
 * MRR/ARR = suma del precio mensual de los clubes ACTIVE que YA facturan. Los
 * clubes en prueba (trialEndsAt en el futuro) todavía no pagan, así que se excluyen
 * del MRR y se cuentan aparte en `trials` para no inflar los ingresos recurrentes.
 */
export async function computePortalBilling() {
  const active = await prisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { priceMonthly: true, trialEndsAt: true },
  })
  const now = Date.now()
  let mrr = 0
  let trials = 0
  for (const t of active) {
    const onTrial = Boolean(t.trialEndsAt && t.trialEndsAt.getTime() > now)
    if (onTrial) trials += 1
    else mrr += t.priceMonthly || 0
  }
  return { mrr, arr: mrr * 12, activeClubs: active.length, trials }
}

// ── Reparto de beneficios (config editable del dashboard) ─────────────────────

export type ProfitSplit = { selfPct: number; selfLabel: string; otherLabel: string }

const PROFIT_SPLIT_KEY = 'profit_split'
const DEFAULT_PROFIT_SPLIT: ProfitSplit = { selfPct: 60, selfLabel: 'Tú', otherLabel: 'ProClub' }

/** Porcentaje entero saneado a [0, 100]. */
function clampPct(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return DEFAULT_PROFIT_SPLIT.selfPct
  return Math.min(100, Math.max(0, v))
}
function clampLabel(s: unknown, max = 40): string {
  return String(s ?? '').trim().slice(0, max)
}

/** Config del reparto de beneficios; defaults 60% "Tú" / 40% "ProClub". */
export async function getProfitSplit(): Promise<ProfitSplit> {
  const row = await prisma.portalSetting.findUnique({ where: { key: PROFIT_SPLIT_KEY } }).catch(() => null)
  const v = (row?.value ?? {}) as Partial<ProfitSplit>
  return {
    selfPct: v.selfPct === undefined ? DEFAULT_PROFIT_SPLIT.selfPct : clampPct(v.selfPct),
    selfLabel: clampLabel(v.selfLabel) || DEFAULT_PROFIT_SPLIT.selfLabel,
    otherLabel: clampLabel(v.otherLabel) || DEFAULT_PROFIT_SPLIT.otherLabel,
  }
}

/** Guarda parcialmente la config del reparto y devuelve la efectiva. */
export async function setProfitSplit(patch: Partial<ProfitSplit>): Promise<ProfitSplit> {
  const current = await getProfitSplit()
  const next: ProfitSplit = {
    selfPct: patch.selfPct === undefined ? current.selfPct : clampPct(patch.selfPct),
    selfLabel: patch.selfLabel === undefined ? current.selfLabel : clampLabel(patch.selfLabel) || current.selfLabel,
    otherLabel: patch.otherLabel === undefined ? current.otherLabel : clampLabel(patch.otherLabel) || current.otherLabel,
  }
  await prisma.portalSetting.upsert({
    where: { key: PROFIT_SPLIT_KEY },
    create: { key: PROFIT_SPLIT_KEY, value: next },
    update: { value: next },
  })
  return next
}

// ── FASE 3: Super-admins del portal (login propio, además del maestro) ────────

export type PortalAdminRow = {
  id: string
  email: string
  name: string
  status: string
  lastLoginAt: string | null
  createdAt: string
}

export async function listPortalAdmins(): Promise<PortalAdminRow[]> {
  const rows = await prisma.portalAdmin.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
  return rows.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.name || '',
    status: a.status,
    lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  }))
}

export async function createPortalAdmin(input: { email: string; password: string; name?: string }) {
  const email = String(input.email || '').trim().toLowerCase()
  if (!isSingleEmail(email)) throw new Error('Email no válido (una sola dirección, sin comas ni espacios).')
  if (String(input.password || '').length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
  const passwordHash = await bcrypt.hash(String(input.password), 10)
  return prisma.portalAdmin.create({
    data: { email, passwordHash, name: input.name?.trim() || null },
    select: { id: true },
  })
}

export async function setPortalAdminStatus(id: string, status: 'ACTIVE' | 'DISABLED') {
  return prisma.portalAdmin.update({ where: { id }, data: { status } })
}

export async function resetPortalAdminPassword(id: string, newPassword: string) {
  if (String(newPassword || '').length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.')
  const passwordHash = await bcrypt.hash(String(newPassword), 10)
  // Marca de corte: invalida las sesiones (cookies HMAC) emitidas antes de ahora,
  // para expulsar una sesión robada al resetear la contraseña.
  return prisma.portalAdmin.update({
    where: { id },
    data: { passwordHash, sessionsInvalidBefore: new Date() },
  })
}

/** Verifica credenciales de un super-admin (email+contraseña). */
export async function verifyPortalAdminUser(rawEmail: string, password: string) {
  const email = String(rawEmail || '').trim().toLowerCase()
  if (!email || !password) return null
  const admin = await prisma.portalAdmin.findUnique({ where: { email } })
  if (!admin || admin.status !== 'ACTIVE') return null
  const ok = await bcrypt.compare(password, admin.passwordHash)
  if (!ok) return null
  prisma.portalAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } }).catch(() => {})
  return { id: admin.id, email: admin.email, name: admin.name || '' }
}

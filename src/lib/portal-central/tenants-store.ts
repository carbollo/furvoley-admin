import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPortalDataDir } from '@/lib/portal-central/config'

export type PortalTenant = {
  id: string
  name: string
  /** URL pública del CRM (redirect SSO en el navegador). */
  url: string
  /** URL privada Railway para verify server-to-server (opcional). */
  internalUrl?: string
}

function normalizeBaseUrl(raw: string | null | undefined, requireHttps = false) {
  let url = String(raw || '')
    .trim()
    .replace(/\/+$/, '')
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`
  if (requireHttps && !/^https:\/\//i.test(url)) return ''
  return url
}

/** Base URL para llamadas internas del portal al CRM (verify, probe). */
export function tenantVerifyBaseUrl(tenant: PortalTenant) {
  return normalizeBaseUrl(tenant.internalUrl || tenant.url)
}

/** Base URL pública del CRM (redirect SSO). */
export function tenantPublicBaseUrl(tenant: PortalTenant) {
  return normalizeBaseUrl(tenant.url, true)
}

const tenantsFile = () => path.join(getPortalDataDir(), 'tenants.json')

export function slugifyTenantId(name: string) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function normalizeTenant(raw: {
  id?: string | null
  name?: string | null
  url?: string | null
  internalUrl?: string | null
}): PortalTenant | null {
  const id = String(raw.id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const name = String(raw.name || raw.id || '').trim()
  const url = normalizeBaseUrl(raw.url, true)
  if (!id || !url) return null
  const internalUrl = normalizeBaseUrl(raw.internalUrl)
  return internalUrl && internalUrl !== url
    ? { id, name: name || id, url, internalUrl }
    : { id, name: name || id, url }
}

function parseEnvTenants(): PortalTenant[] {
  const raw = String(process.env.PORTAL_TENANTS || '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((t) => normalizeTenant(t as PortalTenant)).filter(Boolean) as PortalTenant[]
  } catch {
    return []
  }
}

async function ensureDataDir() {
  await mkdir(getPortalDataDir(), { recursive: true })
}

export async function loadTenants(): Promise<PortalTenant[]> {
  await ensureDataDir()
  try {
    const raw = await readFile(tenantsFile(), 'utf8')
    const parsed = JSON.parse(raw) as { tenants?: unknown[] }
    const list = Array.isArray(parsed?.tenants) ? parsed.tenants : []
    const tenants = list.map((t) => normalizeTenant(t as PortalTenant)).filter(Boolean) as PortalTenant[]
    if (tenants.length > 0) return tenants
  } catch {
    //
  }
  const fromEnv = parseEnvTenants()
  if (fromEnv.length > 0) {
    await saveTenants(fromEnv)
    return fromEnv
  }
  return []
}

export async function saveTenants(tenants: PortalTenant[]) {
  await ensureDataDir()
  const normalized = tenants.map((t) => normalizeTenant(t)).filter(Boolean) as PortalTenant[]
  await writeFile(tenantsFile(), `${JSON.stringify({ tenants: normalized }, null, 2)}\n`, 'utf8')
  return normalized
}

export async function upsertTenant(input: {
  id?: string
  name?: string
  url?: string
  internalUrl?: string
}) {
  const tenants = await loadTenants()
  const id = normalizeTenant({ ...input, id: input.id || slugifyTenantId(input.name || '') })?.id
  if (!id) throw new Error('ID o URL no válidos.')
  const next = normalizeTenant({
    id,
    name: input.name,
    url: input.url,
    internalUrl: input.internalUrl,
  })
  if (!next) throw new Error('Datos del CRM no válidos.')
  const idx = tenants.findIndex((t) => t.id === id)
  if (idx >= 0) tenants[idx] = next
  else tenants.push(next)
  return { tenant: next, tenants: await saveTenants(tenants) }
}

export async function deleteTenant(id: string) {
  const slug = String(id || '').trim()
  const before = await loadTenants()
  const tenants = before.filter((t) => t.id !== slug)
  if (tenants.length === before.length) throw new Error('CRM no encontrado.')
  return saveTenants(tenants)
}

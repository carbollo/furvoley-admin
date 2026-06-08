import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPortalDataDir } from '@/lib/portal-central/config'

export type PortalTenant = {
  id: string
  name: string
  url: string
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
}): PortalTenant | null {
  const id = String(raw.id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const name = String(raw.name || raw.id || '').trim()
  const url = String(raw.url || '')
    .trim()
    .replace(/\/+$/, '')
  if (!id || !url || !/^https?:\/\//i.test(url)) return null
  return { id, name: name || id, url }
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
}) {
  const tenants = await loadTenants()
  const id = normalizeTenant({ ...input, id: input.id || slugifyTenantId(input.name || '') })?.id
  if (!id) throw new Error('ID o URL no válidos.')
  const next = normalizeTenant({ id, name: input.name, url: input.url })
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

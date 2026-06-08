import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const dataDir = String(process.env.PORTAL_DATA_DIR || '/data').trim() || '/data'
const tenantsFile = path.join(dataDir, 'tenants.json')

function normalizeTenant(raw) {
  const id = String(raw?.id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const name = String(raw?.name || raw?.id || '').trim()
  const url = String(raw?.url || '')
    .trim()
    .replace(/\/+$/, '')
  if (!id || !url || !/^https?:\/\//i.test(url)) return null
  return { id, name: name || id, url }
}

function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function parseEnvTenants() {
  const raw = String(process.env.PORTAL_TENANTS || '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeTenant).filter(Boolean)
  } catch {
    return []
  }
}

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true })
}

export async function loadTenants() {
  await ensureDataDir()
  try {
    const raw = await readFile(tenantsFile, 'utf8')
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed?.tenants) ? parsed.tenants : []
    const tenants = list.map(normalizeTenant).filter(Boolean)
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

export async function saveTenants(tenants) {
  await ensureDataDir()
  const normalized = tenants.map(normalizeTenant).filter(Boolean)
  await writeFile(tenantsFile, `${JSON.stringify({ tenants: normalized }, null, 2)}\n`, 'utf8')
  return normalized
}

export async function listTenants() {
  return loadTenants()
}

export async function upsertTenant(input) {
  const tenants = await loadTenants()
  const id = normalizeTenant({ ...input, id: input.id || slugify(input.name) })?.id
  if (!id) throw new Error('ID o URL no válidos.')
  const next = normalizeTenant({ id, name: input.name, url: input.url })
  if (!next) throw new Error('Datos del CRM no válidos.')

  const idx = tenants.findIndex((t) => t.id === id)
  if (idx >= 0) tenants[idx] = next
  else tenants.push(next)

  return { tenant: next, tenants: await saveTenants(tenants) }
}

export async function deleteTenant(id) {
  const slug = String(id || '').trim()
  const tenants = (await loadTenants()).filter((t) => t.id !== slug)
  if (tenants.length === (await loadTenants()).length) {
    throw new Error('CRM no encontrado.')
  }
  return saveTenants(tenants)
}

export { slugify, normalizeTenant, dataDir }

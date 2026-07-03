import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { currentTenant } from '@/lib/multitenant/context'
import { isMultiTenant, tenantStrict } from '@/lib/multitenant/registry'

/**
 * Seguridad SQL: no usar $queryRawUnsafe ni $executeRawUnsafe.
 * SQL nativo solo vía Prisma.$queryRaw(Prisma.sql`...`) con placeholders ${param}.
 *
 * Multi-tenant (Modelo C): `prisma` es un proxy que resuelve el cliente de la
 * base de datos del tenant activo (AsyncLocalStorage). Sin tenant y sin
 * `MULTITENANT=true` se usa `DATABASE_URL` como hasta ahora (modo un-solo-club).
 */

function createClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

const CLIENT_CACHE_MAX = Number(process.env.TENANT_CLIENT_CACHE_MAX || 25)

const globalForPrisma = globalThis as unknown as {
  __prismaDefault?: PrismaClient
  __prismaTenants?: Map<string, PrismaClient>
}

function defaultClient(): PrismaClient {
  if (!globalForPrisma.__prismaDefault) {
    globalForPrisma.__prismaDefault = createClient(process.env.DATABASE_URL!)
  }
  return globalForPrisma.__prismaDefault
}

/** Cliente por tenant, con caché LRU acotada (muchos tenants, pocos abiertos). */
function tenantClient(url: string): PrismaClient {
  const cache = (globalForPrisma.__prismaTenants ??= new Map<string, PrismaClient>())
  const existing = cache.get(url)
  if (existing) {
    cache.delete(url)
    cache.set(url, existing) // refresca orden LRU
    return existing
  }
  const client = createClient(url)
  cache.set(url, client)
  while (cache.size > CLIENT_CACHE_MAX) {
    const oldestKey = cache.keys().next().value as string | undefined
    if (!oldestKey || oldestKey === url) break
    const old = cache.get(oldestKey)
    cache.delete(oldestKey)
    void old?.$disconnect().catch(() => {})
  }
  return client
}

function resolveClient(): PrismaClient {
  const tenant = currentTenant()
  if (tenant?.dbUrl) return tenantClient(tenant.dbUrl)
  if (isMultiTenant() && tenantStrict()) {
    throw new Error(
      '[multitenant] Operación de BD sin tenant en contexto. Debe ejecutarse dentro de withTenant(...).',
    )
  }
  return defaultClient()
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = resolveClient() as unknown as Record<string | symbol, unknown>
    const value = client[prop]
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value
  },
  has(_target, prop) {
    return prop in (resolveClient() as unknown as object)
  },
}) as PrismaClient

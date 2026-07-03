import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Contexto de tenant por petición (Modelo C: 1 app + 1 BD por cliente).
 *
 * El tenant "activo" se propaga con AsyncLocalStorage para que el cliente de
 * Prisma (`@/lib/prisma`) resuelva la base de datos correcta sin tener que
 * pasarlo por parámetro en cada llamada. Se establece en el borde de cada
 * petición (por subdominio) y, en tareas de fondo/webhooks, explícitamente
 * con `withTenant(...)`.
 */
export type TenantContext = {
  slug: string
  dbUrl: string
}

const als = new AsyncLocalStorage<TenantContext>()

/** Ejecuta `fn` con un tenant activo en el contexto (tareas de fondo, tests). */
export function withTenant<T>(ctx: TenantContext, fn: () => T): T {
  return als.run(ctx, fn)
}

/**
 * Activa el tenant para el resto de la ejecución async actual, sin envolver un
 * callback. Se usa en el borde de la petición (p. ej. dentro de requireRoles),
 * ya que Next no ofrece un punto único para envolver todos los handlers.
 */
export function enterTenant(ctx: TenantContext): void {
  als.enterWith(ctx)
}

/** Tenant activo en la petición/tarea actual, si lo hay. */
export function currentTenant(): TenantContext | undefined {
  return als.getStore()
}

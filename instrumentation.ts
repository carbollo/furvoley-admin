import { ensureNextAuthSecret } from '@/lib/auth-secret'

export async function register() {
  ensureNextAuthSecret()
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (String(process.env.PORTAL_CENTRAL_HOST || '').trim().toLowerCase() === 'true') return
  const { scheduleHermesGatewayBoot } = await import('@/lib/hermes-gateway/boot')
  scheduleHermesGatewayBoot()

  // Cron in-process (sin nada externo): envía los formularios de asistencia
  // programados cuando llega su ventana de antelación. Recorre todos los tenants.
  const { scheduleAttendanceCron } = await import('@/lib/attendance-cron')
  scheduleAttendanceCron()

  // Cron in-process: snapshot de KPIs cross-club para el dashboard del portal.
  // Solo se arma en crm-mt (guard interno por MULTITENANT).
  const { scheduleSnapshotCron } = await import('@/lib/snapshot-cron')
  scheduleSnapshotCron()

  // Red de seguridad: promesas fire-and-forget sin .catch (los void fn().catch
  // se pierden hoy). unhandledRejection las recoge en el log de errores.
  const g = globalThis as unknown as { __processErrorHandlers?: boolean }
  if (!g.__processErrorHandlers) {
    g.__processErrorHandlers = true
    process.on('unhandledRejection', (reason) => {
      void import('@/lib/error-log')
        .then(({ logAppError }) => logAppError({ error: reason, source: 'unhandledRejection', level: 'ERROR' }))
        .catch(() => {})
    })
  }
}

/**
 * Captura de errores de SERVIDOR (route handlers, Server Components, server
 * actions) — Next 16 · onRequestError. Corre en Node y FUERA del contexto de
 * tenant (AsyncLocalStorage), así que el club se saca de las cabeceras que puso
 * el middleware (x-tenant-slug) con el host como respaldo. Sus propios fallos no
 * pueden tumbar la respuesta (Next los traga), pero igual van en try/catch.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  try {
    // Ignora el control de flujo de Next (redirect/notFound/…): no son errores.
    const digest = String((error as { digest?: string } | undefined)?.digest || '')
    if (digest.startsWith('NEXT_')) return

    const { logAppError } = await import('@/lib/error-log')
    const { sanitizeSlug, tenantSlugFromHost } = await import('@/lib/multitenant/registry')
    const h = request.headers || {}
    const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
    // El host (subdominio) es la señal AUTORITATIVA del club, igual que en el
    // middleware. NUNCA se confía en el `x-tenant-slug` del cliente en producción
    // (el middleware no lo depura en rutas excluidas como /login o /api/auth, así
    // que uno falseado atribuiría el error a otro club). Solo en modo pruebas
    // (TENANT_ALLOW_OVERRIDE) se acepta la cabecera, ya que ahí el host es el
    // dominio de Railway y no resuelve a un tenant.
    const overrideAllowed =
      String(process.env.TENANT_ALLOW_OVERRIDE || '').trim().toLowerCase() === 'true'
    const fromHost = tenantSlugFromHost(first(h['host']))
    const slug = overrideAllowed
      ? sanitizeSlug(first(h['x-tenant-slug'])) ?? fromHost
      : fromHost

    await logAppError({
      error,
      source: 'onRequestError',
      level: 'ERROR',
      slug,
      route: context.routePath || request.path,
      method: request.method,
      routeType: context.routeType,
      digest: digest || undefined,
    })
  } catch (e) {
    console.warn('[onRequestError] fallo al registrar:', e instanceof Error ? e.message : e)
  }
}

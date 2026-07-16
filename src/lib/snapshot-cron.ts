import { isMultiTenant } from '@/lib/multitenant/registry'
import { collectAndStoreSnapshot } from '@/lib/portal-kpis'

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000 // 1 h

/**
 * Programador IN-PROCESS del snapshot de KPIs cross-club (dashboard super-admin).
 * Sin cron externo: se arranca al iniciar el server (instrumentation) y cada
 * `SNAPSHOT_CRON_INTERVAL_MS` (por defecto 1 h) recorre todos los clubes y guarda
 * una fila agregada en la BD del portal.
 *
 * Solo tiene sentido en crm-mt (MULTITENANT=true, con acceso a las BD tenant_*):
 * en un-solo-club o en el portal se omite. Igual que attendance-cron, asume una
 * sola réplica de crm-mt; con escalado horizontal haría falta un lock distribuido.
 */
export function scheduleSnapshotCron() {
  if (!isMultiTenant()) return // solo el CRM multi-tenant ve todas las BD

  const g = globalThis as unknown as { __snapshotCronTimer?: ReturnType<typeof setInterval> }
  if (g.__snapshotCronTimer) return // evita doble arranque (hot-reload / doble register)

  const intervalMs = Number(process.env.SNAPSHOT_CRON_INTERVAL_MS || DEFAULT_INTERVAL_MS)
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return // 0 = desactivado

  let running = false
  const tick = async () => {
    if (running) return // no solapar
    running = true
    try {
      const res = await collectAndStoreSnapshot()
      if (res) {
        console.log(
          `[snapshot-cron] snapshot guardado (${res.clubsActive} club(es) activos, ${res.membersTotal} socios)`,
        )
      }
    } catch (e) {
      console.error('[snapshot-cron] error:', e instanceof Error ? e.message : e)
    } finally {
      running = false
    }
  }

  // Primer snapshot a los 60s (tras el arranque y el primer tick de asistencia),
  // luego periódico.
  setTimeout(() => void tick(), 60_000)
  const timer = setInterval(() => void tick(), intervalMs)
  timer.unref?.() // no bloquear el cierre del proceso
  g.__snapshotCronTimer = timer
  console.log(`[snapshot-cron] programador activo (cada ${Math.round(intervalMs / 60000)} min)`)
}

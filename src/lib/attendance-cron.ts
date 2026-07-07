import { forEachTenant } from '@/lib/multitenant/dispatch'
import { dispatchDueAttendanceForms } from '@/lib/attendance-link'

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000 // 15 min

/**
 * Programador IN-PROCESS del envío de formularios de asistencia: sin cron externo
 * ni servicios aparte. Se arranca una vez al iniciar el server (instrumentation)
 * y, cada `ATTENDANCE_CRON_INTERVAL_MS` (por defecto 15 min), recorre todos los
 * tenants enviando los formularios cuya ventana de antelación ya llegó.
 *
 * Nota: pensado para una sola instancia del servicio CRM (crm-mt corre 1 réplica).
 * Con escalado horizontal harían falta un lock distribuido para no solapar envíos.
 */
export function scheduleAttendanceCron() {
  const g = globalThis as unknown as { __attendanceCronTimer?: ReturnType<typeof setInterval> }
  if (g.__attendanceCronTimer) return // evita doble arranque (hot-reload / doble register)

  const intervalMs = Number(process.env.ATTENDANCE_CRON_INTERVAL_MS || DEFAULT_INTERVAL_MS)
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return // 0 = desactivado

  let running = false
  const tick = async () => {
    if (running) return // no solapar ejecuciones
    running = true
    try {
      const results = await forEachTenant(() => dispatchDueAttendanceForms())
      const processed = results.reduce((acc, r) => acc + (r.ok ? r.value?.processed ?? 0 : 0), 0)
      if (processed > 0) {
        console.log(`[attendance-cron] ${processed} formulario(s) de asistencia procesados`)
      }
      const failed = results.filter((r) => !r.ok)
      if (failed.length) {
        console.error(
          '[attendance-cron] tenants con error:',
          failed.map((f) => `${f.slug}: ${f.error}`).join(' · '),
        )
      }
    } catch (e) {
      console.error('[attendance-cron] error:', e instanceof Error ? e.message : e)
    } finally {
      running = false
    }
  }

  // Primer tick a los 45s (deja que el server termine de levantar), luego periódico.
  setTimeout(() => void tick(), 45_000)
  const timer = setInterval(() => void tick(), intervalMs)
  timer.unref?.() // no bloquear el cierre del proceso
  g.__attendanceCronTimer = timer
  console.log(`[attendance-cron] programador activo (cada ${Math.round(intervalMs / 60000)} min)`)
}

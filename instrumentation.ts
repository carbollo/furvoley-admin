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
}

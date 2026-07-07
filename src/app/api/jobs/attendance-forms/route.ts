import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { forEachTenant } from '@/lib/multitenant/dispatch'
import { dispatchDueAttendanceForms } from '@/lib/attendance-link'

export const dynamic = 'force-dynamic'

/**
 * Tarea programada: envía los formularios de asistencia cuya ventana de
 * antelación ya ha llegado (`fecha - reminderDays`). Recorre TODOS los tenants.
 * Auth: cabecera `Authorization: Bearer <CRON_SECRET>`. Idealmente cada hora.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const runs = await forEachTenant(() => dispatchDueAttendanceForms())
  const processed = runs.reduce((acc, r) => acc + (r.ok ? r.value?.processed ?? 0 : 0), 0)
  const failed = runs.filter((r) => !r.ok).map((r) => ({ tenant: r.slug, error: r.error }))

  return NextResponse.json({ ok: true, tenants: runs.length, processed, failed })
}

export async function POST(request: Request) {
  return run(request)
}

// Algunos programadores (Railway cron, cron-job.org) disparan por GET.
export async function GET(request: Request) {
  return run(request)
}

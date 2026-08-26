import { NextResponse } from 'next/server'
import { generateDueInvoices, runReminderJob, updateInvoiceStatuses } from '@/app/actions/billing'
import { requireCronAuth } from '@/lib/cron-auth'
import { forEachTenant } from '@/lib/multitenant/dispatch'

export const dynamic = 'force-dynamic'

/**
 * Cron de facturación: genera cuotas vencidas, marca OVERDUE y envía recordatorios.
 * Recorre TODOS los tenants (Modelo C) con forEachTenant → cada club dentro de su
 * BD (withTenant/als.run). Sin esto, en multi-tenant el proxy de prisma lanzaría
 * por "sin tenant" y la facturación quedaría caída para todos. Auth: Bearer CRON_SECRET.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const runs = await forEachTenant(async () => {
    const generated = await generateDueInvoices()
    await updateInvoiceStatuses()
    const reminders = await runReminderJob()
    return { generatedInvoices: generated.createdCount, remindersSent: reminders.sent }
  })

  const generatedInvoices = runs.reduce((a, r) => a + (r.ok ? r.value?.generatedInvoices ?? 0 : 0), 0)
  const remindersSent = runs.reduce((a, r) => a + (r.ok ? r.value?.remindersSent ?? 0 : 0), 0)
  const failed = runs.filter((r) => !r.ok).map((r) => ({ tenant: r.slug, error: r.error }))

  return NextResponse.json({ ok: true, tenants: runs.length, generatedInvoices, remindersSent, failed })
}

export async function POST(request: Request) {
  return run(request)
}

// Algunos programadores (Railway cron, cron-job.org) disparan por GET.
export async function GET(request: Request) {
  return run(request)
}

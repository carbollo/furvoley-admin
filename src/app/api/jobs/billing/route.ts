import { generateDueInvoices, runReminderJob, updateInvoiceStatuses } from '@/app/actions/billing'
import { requireCronAuth } from '@/lib/cron-auth'

export async function POST(req: Request) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const generated = await generateDueInvoices()
  await updateInvoiceStatuses()
  const reminders = await runReminderJob()

  return Response.json({
    ok: true,
    generatedInvoices: generated.createdCount,
    remindersSent: reminders.sent,
  })
}


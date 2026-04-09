import { generateDueInvoices, runReminderJob, updateInvoiceStatuses } from '@/app/actions/billing'

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const generated = await generateDueInvoices()
  await updateInvoiceStatuses()
  const reminders = await runReminderJob()

  return Response.json({
    ok: true,
    generatedInvoices: generated.createdCount,
    remindersSent: reminders.sent,
  })
}


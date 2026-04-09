import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  createMembershipPlan,
  createSubscription,
  generateDueInvoices,
  runReminderJob,
  updateInvoiceStatuses,
} from '@/app/actions/billing'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const [plans, members, subscriptions, invoices, reminderLogs] = await Promise.all([
    prisma.membershipPlan.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.member.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
    prisma.subscription.findMany({
      include: { member: true, plan: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.invoice.findMany({
      include: { member: true },
      orderBy: { issueDate: 'desc' },
      take: 20,
    }),
    prisma.reminderLog.findMany({
      include: { member: true, invoice: true },
      orderBy: { sentAt: 'desc' },
      take: 10,
    }),
  ])

  const overdueCount = invoices.filter((i) => i.status === 'OVERDUE').length
  const overdueAmount = invoices
    .filter((i) => i.status === 'OVERDUE')
    .reduce((acc, i) => acc + (i.totalAmount - i.paidAmount), 0)

  async function createSubAction(formData: FormData) {
    'use server'
    const memberId = String(formData.get('memberId'))
    const planId = String(formData.get('planId'))
    await createSubscription({ memberId, planId })
  }

  async function createPlanAction(formData: FormData) {
    'use server'
    await createMembershipPlan({
      name: String(formData.get('name')),
      amount: Number(formData.get('amount')),
      billingPeriod: String(formData.get('billingPeriod')),
      description: String(formData.get('description') || ''),
      enrollmentFee: Number(formData.get('enrollmentFee') || 0),
    })
  }

  async function generateAction() {
    'use server'
    await generateDueInvoices()
  }

  async function remindersAction() {
    'use server'
    await runReminderJob()
  }

  async function overdueAction() {
    'use server'
    await updateInvoiceStatuses()
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Billing</h1>
        <div className="flex gap-3">
          <form action={generateAction}>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">Generar facturas vencidas</button>
          </form>
          <form action={overdueAction}>
            <button className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium">Actualizar mora</button>
          </form>
          <form action={remindersAction}>
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium">Enviar recordatorios</button>
          </form>
          <Link href="/api/billing/reports/invoices-csv" className="px-4 py-2 bg-slate-200 rounded-lg font-medium">
            Exportar CSV
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-slate-500">Suscripciones activas</p>
          <p className="text-2xl font-bold">{subscriptions.filter((s) => s.status === 'ACTIVE').length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-slate-500">Facturas vencidas</p>
          <p className="text-2xl font-bold">{overdueCount}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-slate-500">Deuda vencida</p>
          <p className="text-2xl font-bold">€{overdueAmount.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border">
        <h2 className="text-lg font-bold mb-4">Crear plan de membresía</h2>
        <form action={createPlanAction} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-8">
          <input name="name" placeholder="Nombre plan" required className="border rounded-lg px-3 py-2 text-slate-900" />
          <input
            name="amount"
            type="number"
            step="0.01"
            placeholder="Precio"
            required
            className="border rounded-lg px-3 py-2 text-slate-900"
          />
          <select name="billingPeriod" className="border rounded-lg px-3 py-2 text-slate-900">
            <option value="MONTHLY">Mensual</option>
            <option value="QUARTERLY">Trimestral</option>
            <option value="YEARLY">Anual</option>
          </select>
          <input name="enrollmentFee" type="number" step="0.01" placeholder="Matrícula" className="border rounded-lg px-3 py-2 text-slate-900" />
          <button className="bg-slate-900 text-white rounded-lg px-3 py-2 font-medium">Crear plan</button>
        </form>

        <h2 className="text-lg font-bold mb-4">Nueva inscripción (socio + plan)</h2>
        <form action={createSubAction} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select name="memberId" className="border rounded-lg px-3 py-2 text-slate-900" required>
            <option value="">Selecciona socio</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select name="planId" className="border rounded-lg px-3 py-2 text-slate-900" required>
            <option value="">Selecciona plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} - €{p.amount}/{p.billingPeriod.toLowerCase()}
              </option>
            ))}
          </select>
          <button className="bg-blue-600 text-white rounded-lg px-3 py-2 font-medium">Crear suscripción</button>
        </form>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="p-4 border-b bg-slate-50 font-semibold">Facturas recientes</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-left">Número</th>
              <th className="p-3 text-left">Socio</th>
              <th className="p-3 text-left">Vencimiento</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-left">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-t">
                <td className="p-3">
                  <Link href={`/billing/invoices/${invoice.id}`} className="text-blue-600 hover:underline">
                    {invoice.invoiceNumber}
                  </Link>
                </td>
                <td className="p-3">{invoice.member.name}</td>
                <td className="p-3">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                <td className="p-3">{invoice.status}</td>
                <td className="p-3">€{(invoice.totalAmount - invoice.paidAmount).toFixed(2)}</td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  No hay facturas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="p-4 border-b bg-slate-50 font-semibold">Últimos recordatorios</div>
        <ul className="divide-y">
          {reminderLogs.map((r) => (
            <li key={r.id} className="p-3 text-sm">
              {new Date(r.sentAt).toLocaleString()} - {r.member.name} - {r.invoice.invoiceNumber} - {r.reminderType} -{' '}
              {r.status}
            </li>
          ))}
          {reminderLogs.length === 0 && <li className="p-4 text-slate-500">Sin recordatorios enviados.</li>}
        </ul>
      </div>
    </div>
  )
}


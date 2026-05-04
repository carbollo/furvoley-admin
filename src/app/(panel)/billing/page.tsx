import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  createMembershipPlan,
  createSubscription,
  deleteMembershipPlan,
  updateMembershipPlan,
} from '@/app/actions/billing'
import { runMemberCreatedWorkflows } from '@/lib/workflow-engine'
import { BillingAutomationButton } from './BillingAutomationButton'

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
    let memberId = String(formData.get('memberId') || '')
    const planId = String(formData.get('planId'))

    const createNewMember = String(formData.get('createNewMember') || '') === 'on'
    if (createNewMember) {
      const name = String(formData.get('newMemberName') || '').trim()
      const dni = String(formData.get('newMemberDni') || '').trim()
      const birthDate = String(formData.get('newMemberBirthDate') || '').trim()
      const address = String(formData.get('newMemberAddress') || '').trim() || null
      const email = String(formData.get('newMemberEmail') || '').trim() || null
      const phone = String(formData.get('newMemberPhone') || '').trim() || null

      if (!name) throw new Error('El nombre del nuevo socio es obligatorio')
      if (!dni) throw new Error('El DNI del nuevo socio es obligatorio')

      const member = await prisma.member.create({
        data: {
          name,
          dni,
          birthDate: birthDate ? new Date(birthDate) : null,
          email,
          phone,
          address,
          status: 'ACTIVE',
        },
      })
      await runMemberCreatedWorkflows(member.id)
      memberId = member.id
    }

    if (!memberId) throw new Error('Selecciona un socio existente o crea uno nuevo')
    await createSubscription({ memberId, planId })
  }

  async function updatePlanAction(formData: FormData) {
    'use server'
    const id = String(formData.get('id'))
    await updateMembershipPlan(id, {
      name: String(formData.get('name')),
      amount: Number(formData.get('amount')),
      billingPeriod: String(formData.get('billingPeriod')),
      enrollmentFee: Number(formData.get('enrollmentFee') || 0),
      description: String(formData.get('description') || ''),
      isActive: String(formData.get('isActive')) === 'on',
    })
  }

  async function deletePlanAction(formData: FormData) {
    'use server'
    const id = String(formData.get('id'))
    await deleteMembershipPlan(id)
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <h1 className="text-3xl font-bold">Billing</h1>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/billing/impagos"
            className="text-sm font-medium text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg hover:bg-rose-100"
          >
            Lista de impagos
          </Link>
          <Link
            href="/billing/extra-invoice"
            className="text-sm font-medium text-slate-800 bg-white border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50"
          >
            Cobro adicional
          </Link>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Automatización</h2>
        <BillingAutomationButton />
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
        <form action={createSubAction} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select name="memberId" className="border rounded-lg px-3 py-2 text-slate-900">
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
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 mb-3">
              <input type="checkbox" name="createNewMember" />
              Crear nuevo socio en esta inscripción
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                name="newMemberName"
                placeholder="Nombre y apellidos"
                className="border rounded-lg px-3 py-2 text-slate-900 bg-white"
              />
              <input
                name="newMemberDni"
                placeholder="DNI"
                className="border rounded-lg px-3 py-2 text-slate-900 bg-white"
              />
              <input
                name="newMemberBirthDate"
                type="date"
                placeholder="Fecha de nacimiento"
                className="border rounded-lg px-3 py-2 text-slate-900 bg-white"
              />
              <input
                name="newMemberEmail"
                type="email"
                placeholder="Correo electrónico (opcional)"
                className="border rounded-lg px-3 py-2 text-slate-900 bg-white"
              />
              <input
                name="newMemberPhone"
                placeholder="Teléfono (opcional)"
                className="border rounded-lg px-3 py-2 text-slate-900 bg-white"
              />
              <input
                name="newMemberAddress"
                placeholder="Domicilio"
                className="border rounded-lg px-3 py-2 text-slate-900 bg-white"
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Si activas esta opción, se crea el socio y se inscribe al plan en un solo paso.
            </p>
          </div>
        </form>
      </div>

      <div className="bg-white p-6 rounded-lg border">
        <h2 className="text-lg font-bold mb-4">Planes de membresía creados</h2>
        <div className="space-y-4">
          {plans.map((plan) => (
            <form key={plan.id} action={updatePlanAction} className="border rounded-lg p-4 space-y-3">
              <input type="hidden" name="id" value={plan.id} />
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <input
                  name="name"
                  defaultValue={plan.name}
                  required
                  className="border rounded-lg px-3 py-2 text-slate-900"
                />
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  defaultValue={plan.amount}
                  required
                  className="border rounded-lg px-3 py-2 text-slate-900"
                />
                <select
                  name="billingPeriod"
                  defaultValue={plan.billingPeriod}
                  className="border rounded-lg px-3 py-2 text-slate-900"
                >
                  <option value="MONTHLY">Mensual</option>
                  <option value="QUARTERLY">Trimestral</option>
                  <option value="YEARLY">Anual</option>
                </select>
                <input
                  name="enrollmentFee"
                  type="number"
                  step="0.01"
                  defaultValue={plan.enrollmentFee}
                  className="border rounded-lg px-3 py-2 text-slate-900"
                />
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="isActive" defaultChecked={plan.isActive} />
                  Activo
                </label>
              </div>
              <input
                name="description"
                defaultValue={plan.description ?? ''}
                placeholder="Descripción"
                className="border rounded-lg px-3 py-2 text-slate-900 w-full"
              />
              <div className="flex gap-3">
                <button className="bg-blue-600 text-white rounded-lg px-3 py-2 font-medium">Guardar cambios</button>
                <button
                  formAction={deletePlanAction}
                  className="bg-rose-600 text-white rounded-lg px-3 py-2 font-medium"
                >
                  Eliminar
                </button>
              </div>
            </form>
          ))}
          {plans.length === 0 && (
            <p className="text-slate-500 text-sm">Aún no has creado planes de membresía.</p>
          )}
        </div>
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


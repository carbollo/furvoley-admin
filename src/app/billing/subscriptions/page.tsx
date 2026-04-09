import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { StripeSubButton } from './StripeSubButton'

export const dynamic = 'force-dynamic'

export default async function SubscriptionsPage() {
  const subscriptions = await prisma.subscription.findMany({
    include: { member: true, plan: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1 className="text-2xl font-bold">Suscripciones</h1>
        <Link href="/billing" className="text-blue-600 hover:underline">
          Volver a billing
        </Link>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-left">Socio</th>
              <th className="p-3 text-left">Plan</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-left">Próxima factura</th>
              <th className="p-3 text-left">Acción</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-3">{s.member.name}</td>
                <td className="p-3">{s.plan.name}</td>
                <td className="p-3">{s.status}</td>
                <td className="p-3">{new Date(s.nextInvoiceDate).toLocaleDateString()}</td>
                <td className="p-3">
                  <StripeSubButton subscriptionId={s.id} />
                </td>
              </tr>
            ))}
            {subscriptions.length === 0 && (
              <tr>
                <td className="p-6 text-center text-slate-500" colSpan={5}>
                  Sin suscripciones.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


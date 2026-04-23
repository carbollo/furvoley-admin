import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { ExtraInvoiceForm } from './ExtraInvoiceForm'

export const dynamic = 'force-dynamic'

export default async function ExtraInvoicePage() {
  const members = await prisma.member.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  return (
    <div className="space-y-6">
      <Link href="/billing" className="text-blue-600 hover:underline text-sm">
        ← Volver a Billing
      </Link>
      <div>
        <h1 className="text-3xl font-bold">Cobro adicional (no cuota)</h1>
        <p className="text-slate-600 mt-1">
          Crea una factura con conceptos personalizados (material, eventos, sanciones, etc.). Aparece
          en la lista de impagos y en contabilidad al cobrarla.
        </p>
      </div>
      <ExtraInvoiceForm members={members} />
    </div>
  )
}

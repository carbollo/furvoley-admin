import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PayInvoiceButton } from './PayInvoiceButton'
import { AdminManualPaymentForm } from './AdminManualPaymentForm'

export const dynamic = 'force-dynamic'

function etiquetaEstadoFactura(status: string) {
  const m: Record<string, string> = {
    PENDING: 'Pendiente',
    OVERDUE: 'Vencida',
    PARTIAL: 'Parcialmente pagada',
    PAID: 'Pagada',
    VOID: 'Anulada',
  }
  return m[status] ?? status
}

function etiquetaMetodoIntento(method: string) {
  const m: Record<string, string> = {
    STRIPE: 'Stripe',
    CASH: 'Efectivo',
    BANK_TRANSFER: 'Transferencia',
  }
  return m[method] ?? method
}

function etiquetaEstadoIntento(status: string) {
  const m: Record<string, string> = {
    PENDING: 'Pendiente',
    SUCCEEDED: 'Completado',
    FAILED: 'Fallido',
  }
  return m[status] ?? status
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = role === 'ADMIN'

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      member: true,
      items: true,
      paymentAttempts: { orderBy: { attemptedAt: 'desc' } },
    },
  })
  if (!invoice) notFound()

  const pending = Math.max(0, invoice.totalAmount - invoice.paidAmount)

  return (
    <div className="space-y-6">
      <Link href="/billing" className="text-blue-600 hover:underline">
        Volver a facturación
      </Link>

      <div className="bg-white rounded-lg border p-6 space-y-3">
        <h1 className="text-2xl font-bold">Factura {invoice.invoiceNumber}</h1>
        <p className="text-slate-600">
          Tipo:{' '}
          {invoice.kind === 'OTHER' ? (
            <span className="font-medium text-amber-800">Cobro adicional</span>
          ) : (
            <span className="font-medium">Cuota / membresía</span>
          )}
        </p>
        <p className="text-slate-600">Socio: {invoice.member.name}</p>
        <p className="text-slate-600">Estado: {etiquetaEstadoFactura(invoice.status)}</p>
        <p className="text-slate-600">Vencimiento: {new Date(invoice.dueDate).toLocaleDateString('es-AR')}</p>
        <p className="text-slate-900 font-semibold">Pendiente: €{pending.toFixed(2)}</p>
        <div className="flex flex-wrap gap-3 items-center">
          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            className="inline-flex text-sm font-medium text-slate-800 bg-slate-100 px-3 py-2 rounded-lg hover:bg-slate-200"
          >
            Descargar PDF (archivo)
          </a>
          {invoice.pdfStoredAt && (
            <span className="text-xs text-slate-500">
              Última generación PDF: {new Date(invoice.pdfStoredAt).toLocaleString('es-ES')}
            </span>
          )}
        </div>
        {pending > 0 && <PayInvoiceButton invoiceId={invoice.id} />}
        {invoice.stripeCheckoutUrl && (
          <a href={invoice.stripeCheckoutUrl} target="_blank" className="text-indigo-600 hover:underline block">
            Abrir último link de pago
          </a>
        )}
        {isAdmin && pending > 0 && (
          <AdminManualPaymentForm invoiceId={invoice.id} maxAmount={pending} />
        )}
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="p-4 border-b bg-slate-50 font-semibold">Conceptos</div>
        <ul>
          {invoice.items.map((item) => (
            <li key={item.id} className="p-4 border-t flex justify-between">
              <span>{item.description}</span>
              <span>€{item.totalAmount.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="p-4 border-b bg-slate-50 font-semibold">Intentos de cobro</div>
        <ul>
          {invoice.paymentAttempts.map((attempt) => (
            <li key={attempt.id} className="p-4 border-t text-sm">
              {new Date(attempt.attemptedAt).toLocaleString('es-AR')} — {etiquetaMetodoIntento(attempt.method)} — {etiquetaEstadoIntento(attempt.status)} — €
              {attempt.amount.toFixed(2)}
            </li>
          ))}
          {invoice.paymentAttempts.length === 0 && (
            <li className="p-4 text-slate-500">Sin intentos aún.</li>
          )}
        </ul>
      </div>
    </div>
  )
}


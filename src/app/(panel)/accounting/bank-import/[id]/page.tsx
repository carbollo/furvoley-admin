import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBankImportDetail } from '@/app/actions/bank-import'
import { ReconcileLineActions } from '../ReconcileLineActions'
import { formatMoney } from '@/lib/format-money'

export const dynamic = 'force-dynamic'

export default async function BankImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const batch = await getBankImportDetail(id)
  if (!batch) notFound()

  const pending = batch.lines.filter((l) => l.status === 'PENDING').length
  const matched = batch.lines.filter((l) => l.status === 'MATCHED').length
  const newLedger = batch.lines.filter((l) => l.status === 'NEW_LEDGER').length
  const ignored = batch.lines.filter((l) => l.status === 'IGNORED').length

  return (
    <div className="space-y-6">
      <Link href="/accounting/bank-import" className="text-blue-600 hover:underline text-sm">
        ← Todas las importaciones
      </Link>

      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {batch.fileName || 'Extracto'} · {batch.lines.length} movimientos
          </h1>
          {batch.note && <p className="text-stone-600 text-sm mt-1">{batch.note}</p>}
          <p className="text-xs text-stone-500 mt-1">
            Importado {new Date(batch.importedAt).toLocaleString('es-ES')}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="bg-amber-50 text-amber-900 px-3 py-1 rounded-full">Pendiente: {pending}</span>
          <span className="bg-emerald-50 text-emerald-900 px-3 py-1 rounded-full">
            Conciliado: {matched}
          </span>
          <span className="bg-indigo-50 text-indigo-900 px-3 py-1 rounded-full">
            Nuevo asiento: {newLedger}
          </span>
          <span className="bg-stone-100 text-stone-600 px-3 py-1 rounded-full">Ignorado: {ignored}</span>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-600">
            <tr>
              <th className="p-3 text-left w-28">Fecha</th>
              <th className="p-3 text-left">Concepto</th>
              <th className="p-3 text-right w-32">Importe</th>
              <th className="p-3 text-left w-48">Conciliación</th>
            </tr>
          </thead>
          <tbody>
            {batch.lines.map((line) => (
              <tr key={line.id} className="border-t border-stone-100 align-top">
                <td className="p-3 text-stone-600 whitespace-nowrap">
                  {new Date(line.date).toLocaleDateString('es-ES')}
                </td>
                <td className="p-3">
                  <p className="text-stone-900">{line.description}</p>
                  {line.reference && (
                    <p className="text-xs text-stone-500 mt-1">Ref: {line.reference}</p>
                  )}
                </td>
                <td
                  className={`p-3 text-right font-mono font-medium whitespace-nowrap ${
                    line.signedAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {line.signedAmount >= 0 ? '+' : ''}
                  {formatMoney(line.signedAmount)}
                </td>
                <td className="p-3">
                  <ReconcileLineActions
                    line={{
                      id: line.id,
                      bankImportId: line.bankImportId,
                      status: line.status,
                      signedAmount: line.signedAmount,
                      date: line.date.toISOString(),
                      description: line.description,
                      reference: line.reference,
                      matchedTransaction: line.matchedTransaction
                        ? {
                            id: line.matchedTransaction.id,
                            type: line.matchedTransaction.type,
                            amount: line.matchedTransaction.amount,
                            description: line.matchedTransaction.description,
                            date: line.matchedTransaction.date.toISOString(),
                            invoice: line.matchedTransaction.invoice,
                          }
                        : null,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

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

  // Sin estos totales, el tesorero no sabía si lo que llevaba conciliado cubría
  // el extracto o le faltaba medio mes por revisar.
  const entradas = batch.lines.filter((l) => l.signedAmount > 0)
  const salidas = batch.lines.filter((l) => l.signedAmount < 0)
  const totalEntradas = entradas.reduce((a, l) => a + l.signedAmount, 0)
  const totalSalidas = salidas.reduce((a, l) => a + Math.abs(l.signedAmount), 0)
  const pendientePorConciliar = batch.lines
    .filter((l) => l.status === 'PENDING')
    .reduce((a, l) => a + Math.abs(l.signedAmount), 0)
  const revisadas = batch.lines.length - pending
  const progreso = batch.lines.length > 0 ? Math.round((revisadas / batch.lines.length) * 100) : 100
  const avisos: string[] = Array.isArray(batch.warnings) ? (batch.warnings as string[]) : []

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

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs font-medium text-stone-500">Entró en la cuenta</p>
          <p className="text-lg font-bold text-emerald-700">{formatMoney(totalEntradas)}</p>
          <p className="text-xs text-stone-500">{entradas.length} movimientos</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs font-medium text-stone-500">Salió de la cuenta</p>
          <p className="text-lg font-bold text-rose-700">{formatMoney(totalSalidas)}</p>
          <p className="text-xs text-stone-500">{salidas.length} movimientos</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs font-medium text-stone-500">Te queda por revisar</p>
          <p className="text-lg font-bold text-amber-700">{formatMoney(pendientePorConciliar)}</p>
          <p className="text-xs text-stone-500">{pending} movimientos</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <p className="text-xs font-medium text-stone-500">Avance</p>
          <p className="text-lg font-bold text-stone-800">{progreso}%</p>
          <div className="mt-2 h-2 rounded-full bg-stone-100 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${progreso}%` }} />
          </div>
        </div>
      </div>

      {avisos.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Avisos de esta importación</p>
          <ul className="mt-2 space-y-1">
            {avisos.map((a, i) => (
              <li key={i} className="text-sm text-amber-900">· {a}</li>
            ))}
          </ul>
        </div>
      )}

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

import Link from 'next/link'
import { getBankImports, deleteBankImportFromForm } from '@/app/actions/bank-import'
import { BankCsvUpload } from './BankCsvUpload'
import { Trash2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function BankImportListPage() {
  const imports = await getBankImports()

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <Link href="/accounting" className="text-blue-600 hover:underline text-sm">
            ← Contabilidad
          </Link>
          <h1 className="text-3xl font-bold mt-2">Importar extracto bancario</h1>
          <p className="text-slate-600 mt-1 text-sm max-w-2xl">
            Sube un CSV del banco, revisa los movimientos y concílialos con los asientos ya
            registrados (cuotas, Stripe, caja…) o crea asientos nuevos. Las sugerencias buscan
            mismo importe y fechas cercanas (±10 días).
          </p>
        </div>
      </div>

      <BankCsvUpload />

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">
          Importaciones recientes
        </div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">Archivo / nota</th>
              <th className="p-3">Líneas</th>
              <th className="p-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {imports.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="p-3 text-slate-600">
                  {new Date(b.importedAt).toLocaleString('es-ES')}
                </td>
                <td className="p-3">
                  <Link href={`/accounting/bank-import/${b.id}`} className="text-blue-600 font-medium hover:underline">
                    {b.fileName || 'Pegado manual'}
                  </Link>
                  {b.note && <p className="text-xs text-slate-500 mt-0.5">{b.note}</p>}
                </td>
                <td className="p-3">{b._count.lines}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/accounting/bank-import/${b.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Conciliar
                    </Link>
                    <form action={deleteBankImportFromForm}>
                      <input type="hidden" name="batchId" value={b.id} />
                      <button
                        type="submit"
                        className="text-rose-500 p-1 hover:bg-rose-50 rounded"
                        title="Eliminar importación"
                      >
                        <Trash2 size={16} />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {imports.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-500">
                  Aún no hay extractos importados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

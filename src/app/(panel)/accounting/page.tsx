import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { TransactionForm } from './TransactionForm'
import { ArrowDownRight, ArrowUpRight, Trash2 } from 'lucide-react'
import { deleteTransaction } from '@/app/actions'

export const dynamic = 'force-dynamic'

export default async function AccountingPage() {
  const transactions = await prisma.transaction.findMany({
    orderBy: { date: 'desc' },
    include: {
      invoice: { select: { id: true, invoiceNumber: true } },
    },
  })

  const income = transactions.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + t.amount, 0)
  const expense = transactions.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + t.amount, 0)
  const balance = income - expense

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold">Contabilidad</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/accounting/bank-import"
            className="text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-100"
          >
            Importar extracto (CSV)
          </Link>
          <TransactionForm />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 font-medium mb-1">Ingresos totales</p>
          <p className="text-2xl font-bold text-emerald-600">€{income.toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 font-medium mb-1">Egresos totales</p>
          <p className="text-2xl font-bold text-rose-600">€{expense.toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 font-medium mb-1">Saldo</p>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
            €{balance.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="p-4 font-medium text-slate-600">Fecha</th>
              <th className="p-4 font-medium text-slate-600">Descripción</th>
              <th className="p-4 font-medium text-slate-600">Tipo</th>
              <th className="p-4 font-medium text-slate-600">Importe</th>
              <th className="p-4 font-medium text-slate-600">Origen / banco</th>
              <th className="p-4 font-medium text-slate-600">Factura</th>
              <th className="p-4 font-medium text-slate-600 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(t => (
              <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="p-4 text-slate-600">{new Date(t.date).toLocaleDateString()}</td>
                <td className="p-4 font-medium">{t.description}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center w-max space-x-1 ${
                    t.type === 'INCOME' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {t.type === 'INCOME' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span>{t.type === 'INCOME' ? 'Ingreso' : 'Egreso'}</span>
                  </span>
                </td>
                <td className={`p-4 font-bold ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {t.type === 'INCOME' ? '+' : '-'}€{t.amount.toFixed(2)}
                </td>
                <td className="p-4 text-sm text-slate-600">
                  <span className="block">{t.source}</span>
                  {t.bankReference && (
                    <span className="text-xs text-slate-500">{t.bankReference}</span>
                  )}
                </td>
                <td className="p-4 text-sm">
                  {t.invoice ? (
                    <a
                      href={`/api/invoices/${t.invoice.id}/pdf`}
                      className="text-blue-600 hover:underline"
                    >
                      {t.invoice.invoiceNumber}
                    </a>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="p-4 text-right">
                  <form action={deleteTransaction.bind(null, t.id)} className="inline">
                    <button type="submit" className="text-rose-500 hover:text-rose-700 p-2">
                      <Trash2 size={18} />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  No hay transacciones registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

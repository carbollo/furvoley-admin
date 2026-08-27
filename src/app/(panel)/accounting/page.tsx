import Link from 'next/link'
import { runWithTenant } from '@/lib/multitenant/request'
import { prisma } from '@/lib/prisma'
import { TransactionForm } from './TransactionForm'
import { ArrowDownRight, ArrowUpRight, Trash2 } from 'lucide-react'
import { deleteTransaction } from '@/app/actions'
import { formatMoney } from '@/lib/format-money'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'

/** Los orígenes se guardan como enum; al tesorero hay que enseñárselos traducidos. */
const ORIGEN_LABEL: Record<string, string> = {
  MANUAL: 'Registrado a mano',
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  BANK_CSV_IMPORT: 'Extracto bancario',
  INVOICE_PAYMENT: 'Cobro de factura',
  WHOP: 'Cobro online',
  STRIPE: 'Cobro online',
}

export const dynamic = 'force-dynamic'

export default async function AccountingPage() {
  return runWithTenant(() => AccountingPageImpl())
}

async function AccountingPageImpl() {
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
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
          <p className="text-sm text-stone-500 font-medium mb-1">Ingresos totales</p>
          <p className="text-2xl font-bold text-emerald-600">{formatMoney(income)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
          <p className="text-sm text-stone-500 font-medium mb-1">Gastos totales</p>
          <p className="text-2xl font-bold text-rose-600">{formatMoney(expense)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-100">
          <p className="text-sm text-stone-500 font-medium mb-1">Saldo</p>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
            {formatMoney(balance)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-100">
              <th className="p-4 font-medium text-stone-600">Fecha</th>
              <th className="p-4 font-medium text-stone-600">Descripción</th>
              <th className="p-4 font-medium text-stone-600">Tipo</th>
              <th className="p-4 font-medium text-stone-600">Importe</th>
              <th className="p-4 font-medium text-stone-600">Origen / banco</th>
              <th className="p-4 font-medium text-stone-600">Factura</th>
              <th className="p-4 font-medium text-stone-600 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(t => (
              <tr key={t.id} className="border-b border-stone-50 hover:bg-stone-50">
                <td className="p-4 text-stone-600">{new Date(t.date).toLocaleDateString('es-ES')}</td>
                <td className="p-4 font-medium">{t.description}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center w-max space-x-1 ${
                    t.type === 'INCOME' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {t.type === 'INCOME' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span>{t.type === 'INCOME' ? 'Ingreso' : 'Gasto'}</span>
                  </span>
                </td>
                <td className={`p-4 font-bold ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {t.type === 'INCOME' ? '+' : '-'}{formatMoney(t.amount)}
                </td>
                <td className="p-4 text-sm text-stone-600">
                  <span className="block">{ORIGEN_LABEL[t.source] ?? t.source}</span>
                  {t.bankReference && (
                    <span className="text-xs text-stone-500">{t.bankReference}</span>
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
                    <span className="text-stone-400">—</span>
                  )}
                </td>
                <td className="p-4 text-right">
                  <form action={deleteTransaction.bind(null, t.id)} className="inline">
                    <ConfirmSubmitButton
                      title="Eliminar este movimiento"
                      message={
                        `${t.description}\n` +
                        `${t.type === 'INCOME' ? 'Ingreso' : 'Gasto'} de ${formatMoney(t.amount)} · ` +
                        `${new Date(t.date).toLocaleDateString('es-ES')}\n\n` +
                        `Se borra también su apunte contable. No se puede deshacer.`
                      }
                      confirmLabel="Eliminar movimiento"
                      ariaLabel={`Eliminar el movimiento ${t.description}`}
                      className="text-rose-500 hover:text-rose-700 p-2"
                    >
                      <Trash2 size={18} />
                    </ConfirmSubmitButton>
                  </form>
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-stone-500">
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

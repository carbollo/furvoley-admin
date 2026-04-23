'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { recordManualInvoicePayment } from '@/app/actions/billing'

type Props = {
  invoiceId: string
  maxAmount: number
}

export function AdminManualPaymentForm({ invoiceId, maxAmount }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const amount = parseFloat(String(fd.get('amount')))
    const method = String(fd.get('method')) as 'BANK_TRANSFER' | 'CASH'
    const bankReference = String(fd.get('bankReference') || '').trim() || null

    if (amount <= 0 || amount > maxAmount + 0.001) {
      setError('Importe no válido')
      setLoading(false)
      return
    }

    try {
      await recordManualInvoicePayment({
        invoiceId,
        amount,
        method,
        bankReference,
      })
      setDone(true)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <p className="text-sm text-emerald-700 font-medium">
        Cobro registrado. El ingreso aparece en Contabilidad vinculado a esta factura.
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
      <h3 className="font-semibold text-slate-800">Registrar cobro manual (banco / caja)</h3>
      <p className="text-xs text-slate-500">
        Pendiente máximo: €{maxAmount.toFixed(2)}. Opcional: referencia bancaria para cuadrar con el
        extracto.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Importe (€)</label>
          <input
            name="amount"
            type="number"
            step="0.01"
            max={maxAmount}
            required
            className="w-full border rounded-lg px-3 py-2 text-slate-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Método</label>
          <select name="method" className="w-full border rounded-lg px-3 py-2 text-slate-900 bg-white">
            <option value="BANK_TRANSFER">Transferencia</option>
            <option value="CASH">Efectivo</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Ref. banco (opc.)</label>
          <input
            name="bankReference"
            type="text"
            className="w-full border rounded-lg px-3 py-2 text-slate-900"
            placeholder="Concepto / ordenante"
          />
        </div>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {loading ? 'Guardando…' : 'Registrar cobro'}
      </button>
    </form>
  )
}

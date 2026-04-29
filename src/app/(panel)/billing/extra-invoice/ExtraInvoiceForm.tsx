'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createManualInvoice } from '@/app/actions/billing'

type Line = { description: string; quantity: number; unitAmount: number }

export function ExtraInvoiceForm({
  members,
}: {
  members: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [lines, setLines] = useState<Line[]>([{ description: '', quantity: 1, unitAmount: 0 }])
  const [tax, setTax] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addLine() {
    setLines((l) => [...l, { description: '', quantity: 1, unitAmount: 0 }])
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const memberId = String(fd.get('memberId'))
    const due = String(fd.get('dueDate'))
    const dueDate = new Date(due)

    const items = lines
      .map((l) => ({
        description: l.description.trim(),
        quantity: Math.max(1, Math.floor(l.quantity)),
        unitAmount: l.unitAmount,
      }))
      .filter((l) => l.description && l.unitAmount > 0)

    if (!memberId || !due) {
      setError('Socio y fecha de vencimiento obligatorios')
      setLoading(false)
      return
    }
    if (!items.length) {
      setError('Añade al menos un concepto con importe')
      setLoading(false)
      return
    }

    try {
      const inv = await createManualInvoice({
        memberId,
        dueDate,
        items,
        ...(tax > 0 ? { taxAmount: tax } : {}),
      })
      router.push(`/billing/invoices/${inv.id}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6 bg-white border rounded-xl p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Socio</label>
          <select
            name="memberId"
            required
            className="w-full border rounded-lg px-3 py-2 text-slate-900 bg-white"
          >
            <option value="">Selecciona…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Vencimiento</label>
          <input
            name="dueDate"
            type="date"
            required
            className="w-full border rounded-lg px-3 py-2 text-slate-900"
            defaultValue={new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold">Conceptos</h3>
          <button
            type="button"
            onClick={addLine}
            className="text-sm text-blue-600 font-medium"
          >
            + Línea
          </button>
        </div>
        <div className="space-y-3">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <div className="md:col-span-6">
                <label className="text-xs text-slate-500">Descripción</label>
                <input
                  value={line.description}
                  onChange={(e) => {
                    const v = e.target.value
                    setLines((prev) => prev.map((p, j) => (j === i ? { ...p, description: v } : p)))
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-slate-900"
                  placeholder="Ej. Uniforme torneo"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Cant.</label>
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) || 1
                    setLines((prev) => prev.map((p, j) => (j === i ? { ...p, quantity: v } : p)))
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-slate-900"
                />
              </div>
              <div className="md:col-span-3">
                <label className="text-xs text-slate-500">Precio unit. (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={line.unitAmount || ''}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0
                    setLines((prev) => prev.map((p, j) => (j === i ? { ...p, unitAmount: v } : p)))
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-slate-900"
                />
              </div>
              <div className="md:col-span-1">
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="text-rose-600 text-sm w-full py-2"
                    onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-xs">
        <label className="block text-sm font-medium text-slate-700 mb-1">
          IVA / otros impuestos (€, opcional)
        </label>
        <input
          type="number"
          step="0.01"
          min={0}
          value={tax || ''}
          onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
          className="w-full border rounded-lg px-3 py-2 text-slate-900"
        />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
      >
        {loading ? 'Creando…' : 'Emitir factura de cobro adicional'}
      </button>
    </form>
  )
}

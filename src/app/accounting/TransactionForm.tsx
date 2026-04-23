'use client'

import { useState } from 'react'
import { createTransaction } from '@/app/actions'
import { Plus, X } from 'lucide-react'

export function TransactionForm() {
  const [isOpen, setIsOpen] = useState(false)

  async function action(formData: FormData) {
    const type = formData.get('type') as string
    const amount = parseFloat(formData.get('amount') as string)
    const description = formData.get('description') as string
    const dateStr = formData.get('date') as string
    const bankReference = (formData.get('bankReference') as string)?.trim() || null

    const date = dateStr ? new Date(dateStr) : new Date()

    await createTransaction({ type, amount, description, date, bankReference, source: 'MANUAL' })
    setIsOpen(false)
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2 transition"
      >
        <Plus size={20} />
        <span>Nueva Transacción</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold">Nueva Transacción</h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <form action={action} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                <select name="type" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-slate-900">
                  <option value="INCOME">Ingreso</option>
                  <option value="EXPENSE">Egreso</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                <input required type="text" name="description" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-slate-900" placeholder="Ej. Compra de balones" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Importe (€)</label>
                <input required type="number" step="0.01" name="amount" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-slate-900" placeholder="100.00" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Referencia banco / extracto (opc.)</label>
                <input type="text" name="bankReference" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-slate-900" placeholder="Ej. Transferencia TPV1234" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
                <input type="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-slate-900" />
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-lg transition">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

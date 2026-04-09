'use client'

import { useState } from 'react'
import { createPayment } from '@/app/actions'
import { Plus, X } from 'lucide-react'

export function PaymentForm({ members }: { members: { id: string, name: string }[] }) {
  const [isOpen, setIsOpen] = useState(false)

  async function action(formData: FormData) {
    const memberId = formData.get('memberId') as string
    const amount = parseFloat(formData.get('amount') as string)
    const month = parseInt(formData.get('month') as string)
    const year = parseInt(formData.get('year') as string)
    const status = formData.get('status') as string

    await createPayment({ memberId, amount, month, year, status })
    setIsOpen(false)
  }

  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2 transition"
      >
        <Plus size={20} />
        <span>Generar Cobro</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold">Generar Cobro</h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <form action={action} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Socio</label>
                <select required name="memberId" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-slate-900">
                  <option value="">Selecciona un socio...</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto ($)</label>
                <input required type="number" step="0.01" name="amount" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-slate-900" placeholder="25.00" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mes</label>
                  <input required type="number" min="1" max="12" name="month" defaultValue={currentMonth} className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-slate-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Año</label>
                  <input required type="number" min="2000" name="year" defaultValue={currentYear} className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-slate-900" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                <select name="status" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-slate-900">
                  <option value="PENDING">Pendiente</option>
                  <option value="PAID">Pagado</option>
                </select>
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

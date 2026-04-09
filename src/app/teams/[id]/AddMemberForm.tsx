'use client'

import { useState } from 'react'
import { addTeamMember } from '@/app/actions/teams'
import { UserPlus, X } from 'lucide-react'

export function AddMemberForm({ teamId, availableMembers }: { teamId: string, availableMembers: { id: string, name: string }[] }) {
  const [isOpen, setIsOpen] = useState(false)

  async function action(formData: FormData) {
    const memberId = formData.get('memberId') as string
    const role = formData.get('role') as string

    await addTeamMember({ teamId, memberId, role })
    setIsOpen(false)
  }

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2 transition"
      >
        <UserPlus size={20} />
        <span>Añadir a Plantilla</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold">Añadir Miembro al Equipo</h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <form action={action} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Socio</label>
                <select required name="memberId" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-slate-900">
                  <option value="">Selecciona un socio...</option>
                  {availableMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rol en el equipo</label>
                <select name="role" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-slate-900">
                  <option value="PLAYER">Jugador</option>
                  <option value="COACH">Entrenador</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-lg transition">
                  Añadir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

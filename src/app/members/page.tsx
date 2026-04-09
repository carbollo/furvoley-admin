import { prisma } from '@/lib/prisma'
import { MemberForm } from './MemberForm'
import { Trash2, Edit2 } from 'lucide-react'
import { deleteMember } from '@/app/actions'

export const dynamic = 'force-dynamic'

export default async function MembersPage() {
  const members = await prisma.member.findMany({
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Socios</h1>
        <MemberForm />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="p-4 font-medium text-slate-600">Nombre</th>
              <th className="p-4 font-medium text-slate-600">Email</th>
              <th className="p-4 font-medium text-slate-600">Teléfono</th>
              <th className="p-4 font-medium text-slate-600">Estado</th>
              <th className="p-4 font-medium text-slate-600 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {members.map(member => (
              <tr key={member.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="p-4 font-medium">{member.name}</td>
                <td className="p-4 text-slate-600">{member.email || '-'}</td>
                <td className="p-4 text-slate-600">{member.phone || '-'}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    member.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {member.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="p-4 text-right space-x-2">
                  <form action={deleteMember.bind(null, member.id)} className="inline">
                    <button type="submit" className="text-rose-500 hover:text-rose-700 p-2">
                      <Trash2 size={18} />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  No hay socios registrados aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

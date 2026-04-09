import { prisma } from '@/lib/prisma'
import { TeamForm } from './TeamForm'
import { Trash2, Users } from 'lucide-react'
import { deleteTeam } from '@/app/actions/teams'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function TeamsPage() {
  const teams = await prisma.team.findMany({
    include: {
      _count: {
        select: { members: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Equipos</h1>
        <TeamForm />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map(team => (
          <div key={team.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{team.name}</h2>
                  {team.category && (
                    <span className="inline-block mt-1 px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded">
                      {team.category}
                    </span>
                  )}
                </div>
                <form action={deleteTeam.bind(null, team.id)}>
                  <button type="submit" className="text-rose-400 hover:text-rose-600 transition">
                    <Trash2 size={18} />
                  </button>
                </form>
              </div>
              
              <div className="flex items-center text-slate-600 mt-4 space-x-2">
                <Users size={18} />
                <span>{team._count.members} miembros</span>
              </div>
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-100">
              <Link 
                href={`/teams/${team.id}`}
                className="block w-full text-center bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-700 font-medium py-2 rounded-lg transition"
              >
                Gestionar Plantilla
              </Link>
            </div>
          </div>
        ))}
        
        {teams.length === 0 && (
          <div className="col-span-full bg-white p-12 text-center rounded-xl border border-slate-100">
            <Users size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-1">No hay equipos</h3>
            <p className="text-slate-500">Crea tu primer equipo para empezar a gestionar las plantillas.</p>
          </div>
        )}
      </div>
    </div>
  )
}

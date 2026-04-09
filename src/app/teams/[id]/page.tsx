import { prisma } from '@/lib/prisma'
import { ArrowLeft, Trash2, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { removeTeamMember } from '@/app/actions/teams'
import { AddMemberForm } from './AddMemberForm'

export const dynamic = 'force-dynamic'

export default async function TeamDetailsPage({ params }: { params: { id: string } }) {
  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: { member: true }
      }
    }
  })

  if (!team) notFound()

  // Get all active members not already in this team
  const existingMemberIds = team.members.map(m => m.memberId)
  const availableMembers = await prisma.member.findMany({
    where: { 
      status: 'ACTIVE',
      id: { notIn: existingMemberIds }
    },
    orderBy: { name: 'asc' }
  })

  const coaches = team.members.filter(m => m.role === 'COACH')
  const players = team.members.filter(m => m.role === 'PLAYER')

  return (
    <div>
      <div className="mb-6">
        <Link href="/teams" className="text-blue-600 hover:underline flex items-center space-x-1 text-sm font-medium">
          <ArrowLeft size={16} />
          <span>Volver a Equipos</span>
        </Link>
      </div>

      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{team.name}</h1>
          {team.category && <p className="text-slate-500 mt-1">Categoría: {team.category}</p>}
        </div>
        <AddMemberForm teamId={team.id} availableMembers={availableMembers} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Jugadores */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h2 className="font-bold text-slate-800">Jugadores ({players.length})</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {players.map(({ id, member }) => (
                <li key={id} className="p-4 flex justify-between items-center hover:bg-slate-50 transition">
                  <div>
                    <p className="font-medium text-slate-900">{member.name}</p>
                    <p className="text-sm text-slate-500">{member.email || member.phone || 'Sin contacto'}</p>
                  </div>
                  <form action={removeTeamMember.bind(null, id)}>
                    <button type="submit" className="text-rose-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition" title="Quitar del equipo">
                      <Trash2 size={18} />
                    </button>
                  </form>
                </li>
              ))}
              {players.length === 0 && (
                <li className="p-8 text-center text-slate-500">No hay jugadores en este equipo.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="space-y-8">
          {/* Entrenadores */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-blue-50 flex justify-between items-center">
              <h2 className="font-bold text-blue-900">Cuerpo Técnico ({coaches.length})</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {coaches.map(({ id, member }) => (
                <li key={id} className="p-4 flex justify-between items-center hover:bg-slate-50 transition">
                  <div>
                    <p className="font-medium text-slate-900">{member.name}</p>
                    <p className="text-sm text-slate-500">{member.phone}</p>
                  </div>
                  <form action={removeTeamMember.bind(null, id)}>
                    <button type="submit" className="text-rose-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition" title="Quitar del equipo">
                      <Trash2 size={18} />
                    </button>
                  </form>
                </li>
              ))}
              {coaches.length === 0 && (
                <li className="p-8 text-center text-slate-500">No hay entrenadores asignados.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

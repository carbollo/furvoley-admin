import { prisma } from '@/lib/prisma'
import { EventForm } from './EventForm'
import { Calendar as CalendarIcon, MapPin, Users, Trash2 } from 'lucide-react'
import { deleteEvent } from '@/app/actions/events'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function CalendarPage() {
  const session = await getServerSession(authOptions)
  const isAdmin = session?.user?.role === 'ADMIN'

  const teams = await prisma.team.findMany({
    orderBy: { name: 'asc' }
  })

  // Fetch events based on role
  let events: any[] = []
  
  if (isAdmin) {
    events = await prisma.event.findMany({
      include: { team: true },
      orderBy: { date: 'asc' },
      where: {
        date: {
          gte: new Date(new Date().setHours(0,0,0,0)) // From today onwards
        }
      }
    })
  } else {
    // For players/coaches, only show their team's events
    const userMember = await prisma.member.findUnique({
      where: { id: session?.user?.memberId || '' },
      include: { teamRoles: true }
    })
    
    if (userMember) {
      const teamIds = userMember.teamRoles.map(tr => tr.teamId)
      events = await prisma.event.findMany({
        where: { 
          teamId: { in: teamIds },
          date: {
            gte: new Date(new Date().setHours(0,0,0,0))
          }
        },
        include: { team: true },
        orderBy: { date: 'asc' }
      })
    }
  }

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'MATCH': return 'bg-rose-100 text-rose-700 border-rose-200'
      case 'TRAINING': return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'TOURNAMENT': return 'bg-amber-100 text-amber-700 border-amber-200'
      default: return 'bg-slate-100 text-slate-700 border-slate-200'
    }
  }

  const getEventTypeName = (type: string) => {
    switch (type) {
      case 'MATCH': return 'Partido'
      case 'TRAINING': return 'Entrenamiento'
      case 'TOURNAMENT': return 'Torneo'
      default: return 'Evento'
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Calendario</h1>
        {isAdmin && <EventForm teams={teams} />}
      </div>

      <div className="space-y-4">
        {events.map(event => (
          <div key={event.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col md:flex-row">
            <div className={`p-6 md:w-48 flex flex-col justify-center items-center border-b md:border-b-0 md:border-r border-slate-100 ${getEventTypeColor(event.type)}`}>
              <span className="text-sm font-bold uppercase tracking-wider mb-2">{getEventTypeName(event.type)}</span>
              <span className="text-3xl font-black">{new Date(event.date).getDate()}</span>
              <span className="text-sm font-medium">{new Date(event.date).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}</span>
              <span className="text-sm font-bold mt-2 bg-white/50 px-2 py-1 rounded">
                {new Date(event.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <h2 className="text-xl font-bold text-slate-900 mb-2">{event.title}</h2>
                  {isAdmin && (
                    <form action={deleteEvent.bind(null, event.id)}>
                      <button type="submit" className="text-rose-400 hover:text-rose-600 p-2 rounded hover:bg-rose-50 transition">
                        <Trash2 size={18} />
                      </button>
                    </form>
                  )}
                </div>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-slate-600 text-sm">
                    <Users size={16} className="mr-2" />
                    <span className="font-medium">Equipo:</span>
                    <span className="ml-1">{event.team.name}</span>
                  </div>
                  {event.location && (
                    <div className="flex items-center text-slate-600 text-sm">
                      <MapPin size={16} className="mr-2" />
                      <span className="font-medium">Lugar:</span>
                      <span className="ml-1">{event.location}</span>
                    </div>
                  )}
                </div>
                
                {event.description && (
                  <p className="text-slate-600 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
                    {event.description}
                  </p>
                )}
              </div>
              
              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                <Link 
                  href={`/calendar/${event.id}`}
                  className="bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 font-medium px-4 py-2 rounded-lg transition"
                >
                  Ver Asistencia
                </Link>
              </div>
            </div>
          </div>
        ))}

        {events.length === 0 && (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-100">
            <CalendarIcon size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-1">No hay eventos próximos</h3>
            <p className="text-slate-500">El calendario está vacío. {isAdmin ? 'Crea un nuevo evento para empezar.' : ''}</p>
          </div>
        )}
      </div>
    </div>
  )
}

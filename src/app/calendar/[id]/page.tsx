import { prisma } from '@/lib/prisma'
import { ArrowLeft, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AttendanceButtons } from './AttendanceButtons'

export const dynamic = 'force-dynamic'

export default async function EventDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      team: true,
      attendances: {
        include: { member: true },
        orderBy: { member: { name: 'asc' } }
      }
    }
  })

  if (!event) notFound()

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PRESENT': return <CheckCircle2 size={20} className="text-emerald-500" />
      case 'ABSENT': return <XCircle size={20} className="text-rose-500" />
      case 'INJURED': return <AlertCircle size={20} className="text-amber-500" />
      default: return <Clock size={20} className="text-slate-400" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PRESENT': return 'Asiste'
      case 'ABSENT': return 'Falta'
      case 'INJURED': return 'Lesionado'
      default: return 'Pendiente'
    }
  }

  const presentCount = event.attendances.filter(a => a.status === 'PRESENT').length
  const absentCount = event.attendances.filter(a => a.status === 'ABSENT').length
  const injuredCount = event.attendances.filter(a => a.status === 'INJURED').length
  const pendingCount = event.attendances.filter(a => a.status === 'PENDING').length

  return (
    <div>
      <div className="mb-6">
        <Link href="/calendar" className="text-blue-600 hover:underline flex items-center space-x-1 text-sm font-medium">
          <ArrowLeft size={16} />
          <span>Volver al Calendario</span>
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">{event.title}</h1>
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span className="bg-slate-100 px-2 py-1 rounded font-medium">{event.team.name}</span>
              <span>{new Date(event.date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span>{new Date(event.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
              {event.location && <span>📍 {event.location}</span>}
            </div>
          </div>
          
          <div className="flex gap-4 text-center">
            <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg">
              <div className="text-2xl font-bold">{presentCount}</div>
              <div className="text-xs font-medium uppercase tracking-wider">Asisten</div>
            </div>
            <div className="bg-rose-50 text-rose-700 px-4 py-2 rounded-lg">
              <div className="text-2xl font-bold">{absentCount}</div>
              <div className="text-xs font-medium uppercase tracking-wider">Faltan</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h2 className="font-bold text-slate-800">Control de Asistencia</h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {event.attendances.map((attendance) => (
            <li key={attendance.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition">
              <div className="flex items-center space-x-3">
                {getStatusIcon(attendance.status)}
                <div>
                  <p className="font-medium text-slate-900">{attendance.member.name}</p>
                  <p className="text-sm text-slate-500">{getStatusText(attendance.status)}</p>
                </div>
              </div>
              
              <AttendanceButtons attendanceId={attendance.id} currentStatus={attendance.status} />
            </li>
          ))}
          {event.attendances.length === 0 && (
            <li className="p-8 text-center text-slate-500">No hay miembros asignados a este evento.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

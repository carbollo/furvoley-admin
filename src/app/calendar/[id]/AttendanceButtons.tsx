'use client'

import { updateAttendance } from '@/app/actions/events'
import { CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react'
import { useTransition } from 'react'

export function AttendanceButtons({ attendanceId, currentStatus }: { attendanceId: string, currentStatus: string }) {
  const [isPending, startTransition] = useTransition()

  const handleUpdate = (status: string) => {
    startTransition(() => {
      updateAttendance(attendanceId, status)
    })
  }

  return (
    <div className="flex space-x-2">
      <button 
        onClick={() => handleUpdate('PRESENT')}
        disabled={isPending}
        className={`p-2 rounded-lg border transition flex items-center justify-center ${
          currentStatus === 'PRESENT' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
            : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-200 hover:text-emerald-600'
        }`}
        title="Asiste"
      >
        <CheckCircle2 size={18} />
      </button>
      
      <button 
        onClick={() => handleUpdate('ABSENT')}
        disabled={isPending}
        className={`p-2 rounded-lg border transition flex items-center justify-center ${
          currentStatus === 'ABSENT' 
            ? 'bg-rose-50 border-rose-200 text-rose-700' 
            : 'bg-white border-slate-200 text-slate-400 hover:border-rose-200 hover:text-rose-600'
        }`}
        title="Falta"
      >
        <XCircle size={18} />
      </button>

      <button 
        onClick={() => handleUpdate('INJURED')}
        disabled={isPending}
        className={`p-2 rounded-lg border transition flex items-center justify-center ${
          currentStatus === 'INJURED' 
            ? 'bg-amber-50 border-amber-200 text-amber-700' 
            : 'bg-white border-slate-200 text-slate-400 hover:border-amber-200 hover:text-amber-600'
        }`}
        title="Lesionado"
      >
        <AlertCircle size={18} />
      </button>

      <button 
        onClick={() => handleUpdate('PENDING')}
        disabled={isPending}
        className={`p-2 rounded-lg border transition flex items-center justify-center ${
          currentStatus === 'PENDING' 
            ? 'bg-slate-100 border-slate-300 text-slate-700' 
            : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'
        }`}
        title="Pendiente"
      >
        <Clock size={18} />
      </button>
    </div>
  )
}

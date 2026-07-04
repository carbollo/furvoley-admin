import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

export const dynamic = 'force-dynamic'

function parseDateParam(value: string | null): Date | null {
  if (!value?.trim()) return null
  const d = new Date(value.trim())
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Registro de asistencia (roadmap · 5.4): recuento y detalle de asistentes
 * por sesión (grupo/equipo + fecha) en un rango.
 */
export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN', 'COACH'], request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const now = new Date()
  const defaultFrom = new Date(now)
  defaultFrom.setDate(defaultFrom.getDate() - 30)
  const from = parseDateParam(url.searchParams.get('from')) ?? defaultFrom
  const toRaw = parseDateParam(url.searchParams.get('to'))
  const to = toRaw ?? now
  to.setHours(23, 59, 59, 999)

  // Un COACH solo ve las sesiones de sus equipos.
  let teamScope: string[] | null = null
  if (auth.role === 'COACH') {
    const memberId = (auth.session.user as { memberId?: string | null }).memberId || null
    if (!memberId) return NextResponse.json({ sessions: [], kpis: null })
    const coachTeams = await prisma.teamMember.findMany({
      where: { memberId, role: 'COACH' },
      select: { teamId: true },
    })
    teamScope = coachTeams.map((t) => t.teamId)
  }

  const events = await prisma.event.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(teamScope ? { teamId: { in: teamScope } } : {}),
    },
    orderBy: { date: 'desc' },
    take: 60,
    select: {
      id: true,
      title: true,
      type: true,
      date: true,
      team: { select: { id: true, name: true } },
      attendances: {
        select: {
          id: true,
          status: true,
          reason: true,
          member: { select: { name: true } },
        },
      },
    },
  })

  const sessions = events
    .filter((e) => e.attendances.length > 0)
    .map((e) => {
      const counts = { present: 0, late: 0, absent: 0, pending: 0 }
      for (const a of e.attendances) {
        if (a.status === 'PRESENT') counts.present++
        else if (a.status === 'LATE') counts.late++
        else if (a.status === 'ABSENT') counts.absent++
        else counts.pending++
      }
      const total = e.attendances.length
      const marked = total - counts.pending
      return {
        eventId: e.id,
        title: e.title,
        type: e.type,
        date: e.date.toISOString(),
        team: e.team ? { id: e.team.id, name: e.team.name } : null,
        counts,
        total,
        marked,
        rate: marked > 0 ? Math.round(((counts.present + counts.late) / marked) * 100) : null,
        detail: e.attendances
          .map((a) => ({ name: a.member.name, status: a.status, reason: a.reason || null }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      }
    })

  const rated = sessions.filter((s) => s.rate !== null)
  const kpis = {
    sessions: sessions.length,
    avgRate: rated.length > 0 ? Math.round(rated.reduce((a, s) => a + (s.rate ?? 0), 0) / rated.length) : null,
    presents: sessions.reduce((a, s) => a + s.counts.present + s.counts.late, 0),
    absents: sessions.reduce((a, s) => a + s.counts.absent, 0),
    pendingSessions: sessions.filter((s) => s.marked === 0).length,
  }

  return NextResponse.json({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    kpis,
    sessions,
  })
}

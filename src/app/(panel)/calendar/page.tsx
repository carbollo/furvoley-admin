import { prisma } from '@/lib/prisma'
import { runWithTenant } from '@/lib/multitenant/request'
import { EventForm } from './EventForm'
import { deleteEvent } from '@/app/actions/events'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { normalizeRole } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

const ON_SURFACE = '#191b23'
const ON_SURFACE_VARIANT = '#424754'
const OUTLINE = '#727785'
const PRIMARY = '#0058be'
const SURFACE_CONTAINER = '#ecedf7'
const SHADOW = '0 4px 10px rgba(0,0,0,0.04)'
const BORDER = '1px solid rgba(194,198,214,0.4)'

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

type EventTypeKey = 'MATCH' | 'TRAINING' | 'TOURNAMENT' | 'SOCIAL' | 'OTHER'

const EVENT_STYLE: Record<EventTypeKey, { label: string; bg: string; color: string; pill: string }> = {
  MATCH: {
    label: 'Partido',
    bg: 'rgba(186,26,26,0.08)',
    color: '#ba1a1a',
    pill: 'rgba(186,26,26,0.12)',
  },
  TRAINING: {
    label: 'Entrenamiento',
    bg: 'rgba(0,88,190,0.08)',
    color: PRIMARY,
    pill: 'rgba(0,88,190,0.12)',
  },
  TOURNAMENT: {
    label: 'Torneo',
    bg: 'rgba(245,158,11,0.10)',
    color: '#b45309',
    pill: 'rgba(245,158,11,0.14)',
  },
  SOCIAL: {
    label: 'Reunión',
    bg: 'rgba(87,94,112,0.12)',
    color: '#575e70',
    pill: 'rgba(87,94,112,0.16)',
  },
  OTHER: {
    label: 'Evento',
    bg: 'rgba(77,93,115,0.12)',
    color: '#4d5d73',
    pill: 'rgba(77,93,115,0.16)',
  },
}

function styleForType(type: string) {
  return EVENT_STYLE[(type as EventTypeKey)] || EVENT_STYLE.OTHER
}

export default async function CalendarPage() {
  return runWithTenant(() => CalendarPageImpl())
}

async function CalendarPageImpl() {
  const session = await getServerSession(authOptions)
  const role = normalizeRole(session?.user?.role)
  const isAdmin = role === 'ADMIN'
  const isCoach = role === 'COACH'
  const isMember = role === 'MEMBER'

  const teams = await prisma.team.findMany({ orderBy: { name: 'asc' } })

  type EventWithTeam = Awaited<
    ReturnType<typeof prisma.event.findMany<{ include: { team: true } }>>
  >[number]
  let events: EventWithTeam[] = []

  const todayStart = new Date(new Date().setHours(0, 0, 0, 0))

  if (isAdmin) {
    events = await prisma.event.findMany({
      include: { team: true },
      orderBy: { date: 'asc' },
      where: { date: { gte: todayStart } },
    })
  } else if (isCoach || isMember) {
    const userMember = await prisma.member.findUnique({
      where: { id: session?.user?.memberId || '' },
      include: { teamRoles: true },
    })
    if (userMember) {
      const teamIds = userMember.teamRoles.map((tr) => tr.teamId)
      events = await prisma.event.findMany({
        where: { teamId: { in: teamIds }, date: { gte: todayStart } },
        include: { team: true },
        orderBy: { date: 'asc' },
      })
    }
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto' }}>
      <header
        className="flex items-start justify-between gap-4 flex-wrap"
        style={{ marginBottom: 32 }}
      >
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: ON_SURFACE,
              letterSpacing: '-0.01em',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Calendario
          </h1>
          <p style={{ color: ON_SURFACE_VARIANT, fontSize: 16, marginTop: 6 }}>
            {isAdmin
              ? 'Todos los eventos próximos del club.'
              : isCoach
                ? 'Próximos eventos de los equipos que entrenas.'
                : 'Próximos eventos de tus equipos.'}
          </p>
        </div>
        {isAdmin && <EventForm teams={teams} />}
      </header>

      <div className="flex flex-col gap-4">
        {events.length === 0 && (
          <div
            style={{
              background: '#fff',
              border: BORDER,
              boxShadow: SHADOW,
              borderRadius: 16,
              padding: 48,
              textAlign: 'center',
              color: OUTLINE,
            }}
          >
            <p style={{ fontWeight: 700, color: ON_SURFACE, fontSize: 18, margin: 0 }}>
              No hay eventos próximos
            </p>
            <p style={{ marginTop: 6, fontSize: 14, color: OUTLINE }}>
              {isAdmin ? 'Crea un nuevo evento para empezar.' : 'Vuelve más tarde para nuevas convocatorias.'}
            </p>
          </div>
        )}

        {events.map((event) => {
          const st = styleForType(event.type)
          const dt = new Date(event.date)
          return (
            <article
              key={event.id}
              className="rounded-xl overflow-hidden flex flex-col md:flex-row"
              style={{ background: '#fff', border: BORDER, boxShadow: SHADOW }}
            >
              <div
                className="p-6 flex flex-col items-center justify-center"
                style={{
                  minWidth: 200,
                  background: st.bg,
                  color: st.color,
                  borderRight: '1px solid rgba(194,198,214,0.2)',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {st.label}
                </span>
                <span style={{ fontSize: 36, fontWeight: 900, marginTop: 8, lineHeight: 1 }}>
                  {dt.getDate()}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                  {MONTHS_SHORT[dt.getMonth()]} {dt.getFullYear()}
                </span>
                <span
                  style={{
                    marginTop: 10,
                    background: 'rgba(255,255,255,0.7)',
                    color: ON_SURFACE,
                    padding: '4px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="p-6 flex-1 flex flex-col justify-between min-w-0">
                <div>
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <h2
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: ON_SURFACE,
                        margin: 0,
                        lineHeight: 1.3,
                      }}
                    >
                      {event.title}
                    </h2>
                    {isAdmin && (
                      <form action={deleteEvent.bind(null, event.id)}>
                        <button
                          type="submit"
                          aria-label="Eliminar evento"
                          style={{
                            color: '#ba1a1a',
                            background: 'rgba(186,26,26,0.08)',
                            border: 'none',
                            padding: '6px 10px',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          Eliminar
                        </button>
                      </form>
                    )}
                  </div>

                  <div
                    className="flex flex-wrap gap-3 mt-3"
                    style={{ color: ON_SURFACE_VARIANT, fontSize: 14 }}
                  >
                    {event.team && (
                      <span
                        style={{
                          background: st.pill,
                          color: st.color,
                          padding: '4px 12px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {event.team.name}
                      </span>
                    )}
                    {event.location && (
                      <span
                        style={{
                          background: SURFACE_CONTAINER,
                          color: ON_SURFACE_VARIANT,
                          padding: '4px 12px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        📍 {event.location}
                      </span>
                    )}
                  </div>

                  {event.description && (
                    <p
                      style={{
                        marginTop: 14,
                        padding: '12px 14px',
                        background: '#f2f3fd',
                        borderRadius: 12,
                        fontSize: 13,
                        color: ON_SURFACE_VARIANT,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {event.description}
                    </p>
                  )}
                </div>

                <div
                  className="mt-6 pt-4 flex justify-end"
                  style={{ borderTop: '1px solid rgba(194,198,214,0.25)' }}
                >
                  <Link
                    href={`/calendar/${event.id}`}
                    style={{
                      background: 'rgba(0,88,190,0.08)',
                      color: PRIMARY,
                      padding: '8px 16px',
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    Ver detalles
                  </Link>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

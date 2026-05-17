import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import CrmApp from '@/components/crm/CrmApp'
import { AppShell } from '@/components/AppShell'
import { normalizeRole } from '@/lib/rbac'

const ACCENT = '#3B82F6'
const ACCENT_LIGHT = '#EFF6FF'
const GREEN = '#10B981'
const GREEN_LIGHT = '#ECFDF5'
const AMBER = '#F59E0B'
const AMBER_LIGHT = '#FFFBEB'
const RED = '#EF4444'
const RED_LIGHT = '#FEF2F2'
const PURPLE = '#8B5CF6'
const PURPLE_LIGHT = '#F5F3FF'
const BORDER = 'rgba(15,23,42,0.07)'
const CARD_SHADOW = '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)'

function etiquetaEstadoFactura(status: string) {
  const m: Record<string, string> = {
    PENDING: 'Pendiente',
    OVERDUE: 'Vencida',
    PARTIAL: 'Parcial',
    PAID: 'Pagada',
    VOID: 'Anulada',
  }
  return m[status] ?? status
}

function badgeColors(status: string) {
  switch (status) {
    case 'PAID':
      return { bg: GREEN_LIGHT, fg: GREEN }
    case 'PENDING':
    case 'PARTIAL':
      return { bg: AMBER_LIGHT, fg: AMBER }
    case 'OVERDUE':
      return { bg: RED_LIGHT, fg: RED }
    default:
      return { bg: '#F1F5F9', fg: '#64748b' }
  }
}

function initials(name?: string | null) {
  if (!name) return '—'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3)
}

function MiniLineChart({
  data,
  color,
  width = 86,
  height = 34,
}: {
  data: number[]
  color: string
  width?: number
  height?: number
}) {
  const d = data && data.length ? data : [0]
  const max = Math.max(...d)
  const min = Math.min(...d)
  const range = max - min || 1
  const pts = d
    .map((v, i) => {
      const x = (i / (d.length - 1 || 1)) * width
      const y = height - ((v - min) / range) * (height - 6) - 3
      return `${x},${y}`
    })
    .join(' ')
  const id = `lg${color.replace(/[^a-z0-9]/gi, '')}`
  const area = `0,${height} ${pts} ${width},${height}`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline
        points={pts}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  color,
  spark,
}: {
  label: string
  value: string
  sub: string
  icon: 'users' | 'calendar' | 'billing' | 'reports'
  color: string
  spark: number[]
}) {
  const iconPath = (() => {
    const p = {
      width: 20,
      height: 20,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
    }
    switch (icon) {
      case 'users':
        return (
          <svg {...p}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
        )
      case 'calendar':
        return (
          <svg {...p}>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        )
      case 'billing':
        return (
          <svg {...p}>
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        )
      case 'reports':
        return (
          <svg {...p}>
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        )
    }
  })()
  return (
    <div
      style={{
        flex: 1,
        minWidth: 220,
        background: '#fff',
        borderRadius: 16,
        padding: '20px 24px',
        boxShadow: CARD_SHADOW,
        border: `1px solid ${BORDER}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{label}</span>
          <span
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-0.5px',
              color: '#111827',
            }}
          >
            {value}
          </span>
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: `${color}15`,
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {iconPath}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 12, color: '#6b7280' }}>{sub}</span>
        <MiniLineChart data={spark} color={color} />
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const role = normalizeRole((session.user as { role?: string }).role)
  if (role === 'ADMIN' || role === 'COACH' || role === 'TREASURER') {
    return (
      <Suspense fallback={<div style={{ padding: 32, color: '#475569' }}>Cargando CRM…</div>}>
        <CrmApp />
      </Suspense>
    )
  }

  const userMember = await prisma.member.findUnique({
    where: { id: session.user?.memberId || '' },
    include: {
      teamRoles: {
        include: { team: true },
      },
    },
  })

  const memberInvoices = userMember
    ? await prisma.invoice.findMany({
        where: { memberId: userMember.id },
        orderBy: { issueDate: 'desc' },
        take: 6,
      })
    : []

  const debt = memberInvoices
    .filter((i) => i.status !== 'PAID' && i.status !== 'VOID')
    .reduce((acc, i) => acc + (i.totalAmount - i.paidAmount), 0)

  const pendingInvoices = memberInvoices.filter(
    (i) => i.status !== 'PAID' && i.status !== 'VOID',
  )
  const overdueCount = memberInvoices.filter((i) => i.status === 'OVERDUE').length

  const teamIds = userMember?.teamRoles.map((tr) => tr.teamId) ?? []
  const upcomingTeamEvents = teamIds.length
    ? await prisma.event.findMany({
        where: {
          teamId: { in: teamIds },
          date: { gte: new Date() },
        },
        include: { team: true },
        orderBy: { date: 'asc' },
        take: 6,
      })
    : []

  const newsPosts = await prisma.newsPost.findMany({
    where: { isPublished: true },
    orderBy: [{ priority: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: 6,
  })

  const publicEvents = await prisma.event.findMany({
    where: { isPublic: true, date: { gte: new Date() } },
    orderBy: { date: 'asc' },
    take: 6,
  })

  const today = new Date()
  const dateStr = today.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const dateStrPretty = dateStr.charAt(0).toUpperCase() + dateStr.slice(1)
  const userName = session.user?.name || 'Socio'
  const firstName = String(userName).trim().split(/\s+/)[0]

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(n)

  const eventTypeColor: Record<string, string> = {
    MATCH: RED,
    TRAINING: ACCENT,
    TOURNAMENT: AMBER,
  }
  const eventTypeLabel: Record<string, string> = {
    MATCH: 'Partido',
    TRAINING: 'Entrenamiento',
    TOURNAMENT: 'Torneo',
  }

  return (
    <AppShell flush>
      <div
        style={{
          padding: '32px 36px 56px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          minHeight: '100%',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: '#111827',
                letterSpacing: '-0.5px',
                margin: 0,
              }}
            >
              Hola, {firstName}
            </h1>
            <p
              style={{
                color: '#6b7280',
                fontSize: 14,
                marginTop: 4,
                marginBottom: 0,
                textTransform: 'capitalize',
              }}
            >
              {dateStrPretty}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/calendar"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 12,
                border: `1px solid ${BORDER}`,
                background: '#fff',
                color: '#111827',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Ver calendario
            </Link>
            <Link
              href="/my-billing"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 12,
                border: 'none',
                background: ACCENT,
                color: '#fff',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              Mis Pagos
            </Link>
          </div>
        </div>

        {/* KPI ROW */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <KpiCard
            label="Deuda actual"
            value={fmtMoney(debt)}
            sub={debt > 0 ? `${pendingInvoices.length} factura(s) por pagar` : 'Estás al día'}
            icon="billing"
            color={debt > 0 ? AMBER : GREEN}
            spark={debt > 0 ? [1, 2, 3, 2, 4, 3, 4] : [4, 3, 4, 3, 2, 2, 1]}
          />
          <KpiCard
            label="Próximos eventos"
            value={String(upcomingTeamEvents.length)}
            sub={
              upcomingTeamEvents.length > 0
                ? 'Partidos y entrenos'
                : 'No tienes eventos próximos'
            }
            icon="calendar"
            color={ACCENT}
            spark={[1, 2, 1, 3, 2, 4, upcomingTeamEvents.length || 0]}
          />
          <KpiCard
            label="Mis equipos"
            value={String(userMember?.teamRoles.length ?? 0)}
            sub={
              userMember?.teamRoles.length
                ? userMember.teamRoles.map((tr) => tr.team.name).slice(0, 2).join(', ')
                : 'Aún no asignado'
            }
            icon="users"
            color={PURPLE}
            spark={[2, 2, 3, 2, 3, 2, userMember?.teamRoles.length || 0]}
          />
          <KpiCard
            label="Facturas vencidas"
            value={String(overdueCount)}
            sub={overdueCount > 0 ? 'Requieren tu atención' : 'Todo en orden'}
            icon="reports"
            color={overdueCount > 0 ? RED : GREEN}
            spark={[1, 1, 2, 1, 2, 1, overdueCount || 0]}
          />
        </div>

        {/* MAIN ROW: Próximos eventos + Mis equipos */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              flex: 2,
              minWidth: 320,
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              boxShadow: CARD_SHADOW,
              border: `1px solid ${BORDER}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
                Próximos eventos
              </div>
              <Link
                href="/calendar"
                style={{
                  fontSize: 12,
                  color: ACCENT,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Ver todos →
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcomingTeamEvents.map((e) => {
                const dt = new Date(e.date)
                const tipoColor = eventTypeColor[e.type] || ACCENT
                const tipoLabel = eventTypeLabel[e.type] || 'Evento'
                return (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 0',
                      borderBottom: `1px solid ${BORDER}`,
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        flexShrink: 0,
                        textAlign: 'center',
                        background: `${tipoColor}15`,
                        borderRadius: 10,
                        padding: '6px 4px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: tipoColor,
                          lineHeight: 1,
                        }}
                      >
                        {dt.getDate()}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: tipoColor,
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          marginTop: 3,
                          letterSpacing: 0.4,
                        }}
                      >
                        {dt
                          .toLocaleString('es', { month: 'short' })
                          .replace('.', '')}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: '#111827',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {e.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {dt.toLocaleTimeString('es', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' — '}
                        {e.location || 'Sin ubicación'}
                        {' · '}
                        {e.team?.name || 'Equipo'}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: 999,
                        background: `${tipoColor}15`,
                        color: tipoColor,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tipoLabel}
                    </span>
                  </div>
                )
              })}
              {upcomingTeamEvents.length === 0 && (
                <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>
                  No tienes eventos próximos en tus equipos.
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 280,
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              boxShadow: CARD_SHADOW,
              border: `1px solid ${BORDER}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>Mis equipos</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                {userMember?.teamRoles.length || 0} asignación(es)
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {userMember?.teamRoles.map((tr) => (
                <div
                  key={tr.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: PURPLE_LIGHT,
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: `${PURPLE}25`,
                      color: PURPLE,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 13,
                      flexShrink: 0,
                    }}
                  >
                    {initials(tr.team.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: '#111827',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {tr.team.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: PURPLE,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                      }}
                    >
                      {tr.role === 'COACH' ? 'Entrenador' : 'Jugador'}
                    </div>
                  </div>
                </div>
              ))}
              {(!userMember || userMember.teamRoles.length === 0) && (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>
                  Aún no estás asignado a ningún equipo.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECOND ROW: Mis facturas + Mural de noticias + Eventos públicos */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              flex: 1,
              minWidth: 320,
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              boxShadow: CARD_SHADOW,
              border: `1px solid ${BORDER}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
                Mis facturas recientes
              </div>
              <Link
                href="/my-billing"
                style={{
                  fontSize: 12,
                  color: ACCENT,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Ver todas →
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {memberInvoices.map((inv) => {
                const pending = Math.max(0, inv.totalAmount - inv.paidAmount)
                const colors = badgeColors(inv.status)
                return (
                  <div
                    key={inv.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 0',
                      borderBottom: `1px solid ${BORDER}`,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: ACCENT_LIGHT,
                        color: ACCENT,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: '#111827',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {inv.invoiceNumber}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        Vence{' '}
                        {new Date(inv.dueDate).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: '#111827',
                        }}
                      >
                        {fmtMoney(pending > 0 ? pending : inv.totalAmount)}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: colors.bg,
                          color: colors.fg,
                        }}
                      >
                        {etiquetaEstadoFactura(inv.status)}
                      </span>
                    </div>
                  </div>
                )
              })}
              {memberInvoices.length === 0 && (
                <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>
                  No tienes facturas registradas.
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 320,
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              boxShadow: CARD_SHADOW,
              border: `1px solid ${BORDER}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
                Mural de noticias
              </div>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>
                {newsPosts.length} publicación(es)
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {newsPosts.map((post) => (
                <div
                  key={post.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: '#f8fafc',
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: '#111827',
                        flex: 1,
                        minWidth: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {post.title}
                    </div>
                    {post.priority === 'HIGH' && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: RED_LIGHT,
                          color: RED,
                          letterSpacing: 0.4,
                          textTransform: 'uppercase',
                        }}
                      >
                        Destacada
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: '#475569',
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {post.content}
                  </p>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#9ca3af',
                      marginTop: 8,
                    }}
                  >
                    {new Date(
                      post.publishedAt || post.createdAt,
                    ).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                </div>
              ))}
              {newsPosts.length === 0 && (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>
                  No hay noticias publicadas.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* THIRD ROW: Eventos públicos */}
        {publicEvents.length > 0 && (
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              boxShadow: CARD_SHADOW,
              border: `1px solid ${BORDER}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
                Eventos públicos del club
              </div>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>
                {publicEvents.length} próximos
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              {publicEvents.map((e) => {
                const dt = new Date(e.date)
                const tipoColor = eventTypeColor[e.type] || ACCENT
                const tipoLabel = eventTypeLabel[e.type] || 'Evento'
                return (
                  <div
                    key={e.id}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 12,
                      background: '#f8fafc',
                      border: `1px solid ${BORDER}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: `${tipoColor}15`,
                        color: tipoColor,
                        alignSelf: 'flex-start',
                      }}
                    >
                      {tipoLabel}
                    </span>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: '#111827',
                      }}
                    >
                      {e.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {dt.toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                      })}
                      {' · '}
                      {dt.toLocaleTimeString('es', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      {e.location || 'Ubicación pendiente'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

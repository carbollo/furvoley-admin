import Link from 'next/link'
import { PayMyInvoiceButton } from '@/app/(panel)/my-billing/PayMyInvoiceButton'
import { formatMoney } from '@/lib/format-money'
import {
  memberInvoiceBadge,
  MEMBER_INVOICE_BADGE_STYLES,
} from '@/lib/invoice-display'
import {
  CalendarIcon,
  ClockIcon,
  ConfettiIcon,
  DownloadIcon,
  GroupsIcon,
  MapPinIcon,
  VolleyballIcon,
  WalletIcon,
  WarningIcon,
} from './icons'

const PRIMARY = '#0058be'
const ON_SURFACE = '#191b23'
const ON_SURFACE_VARIANT = '#424754'
const OUTLINE = '#727785'
const OUTLINE_VARIANT = '#c2c6d6'
const SURFACE_CONTAINER = '#ecedf7'
const SECONDARY = '#575e70'
const TERTIARY = '#4d5d73'

const SHADOW = '0 4px 10px rgba(0,0,0,0.04)'
const BORDER = '1px solid rgba(194,198,214,0.4)'

type MemberInvoice = {
  id: string
  invoiceNumber: string
  totalAmount: number
  paidAmount: number
  issueDate: Date
  dueDate: Date
  status: string
}

type MemberTeam = {
  id: string
  name: string
  role: string
  memberCount: number
  category: string | null
}

type MemberEvent = {
  id: string
  title: string
  date: Date
  type: string
  location: string | null
  teamName: string | null
}

type NewsItem = {
  id: string
  title: string
  content: string
  priority: string
  publishedAt: Date | null
  createdAt: Date
}

type PublicEvent = {
  id: string
  title: string
  date: Date
  type: string
}

type Props = {
  firstName: string
  dateStrPretty: string
  debt: number
  pendingInvoiceCount: number
  overdueCount: number
  nextDueLabel: string | null
  upcomingTeamEvents: MemberEvent[]
  teams: MemberTeam[]
  recentInvoices: MemberInvoice[]
  news: NewsItem[]
  publicEvents: PublicEvent[]
  /** Socio con cuota obligatoria de alta sin pagar aún */
  enrollmentPaymentPending?: boolean
}

const fmtMoney = (n: number) => formatMoney(n)

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function eventTypeLabel(t: string) {
  switch (t) {
    case 'MATCH':
      return 'Partido'
    case 'TRAINING':
      return 'Entrenamiento'
    case 'TOURNAMENT':
      return 'Torneo'
    case 'SOCIAL':
      return 'Reunión'
    default:
      return 'Evento'
  }
}

export function MemberDashboard({
  firstName,
  dateStrPretty,
  debt,
  pendingInvoiceCount,
  overdueCount,
  nextDueLabel,
  upcomingTeamEvents,
  teams,
  recentInvoices,
  news,
  publicEvents,
  enrollmentPaymentPending = false,
}: Props) {
  return (
    <div style={{ maxWidth: 1320, margin: '0 auto' }}>
      {enrollmentPaymentPending ? (
        <div
          style={{
            marginBottom: 24,
            padding: '16px 20px',
            borderRadius: 14,
            background: 'rgba(0,88,190,0.08)',
            border: `1px solid ${PRIMARY}33`,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
            <WarningIcon size={22} />
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: ON_SURFACE }}>
                Alta pendiente de pago
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: ON_SURFACE_VARIANT, lineHeight: 1.45 }}>
                Debes abonar la cuota de inscripción para quedar como socio activo. Puedes pagar desde Mis
                Pagos.
              </p>
            </div>
          </div>
          <Link
            href="/my-billing"
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              background: PRIMARY,
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Ir a Mis Pagos
          </Link>
        </div>
      ) : null}
      {/* Greeting */}
      <header style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: ON_SURFACE,
            letterSpacing: '-0.01em',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          ¡Hola {firstName}!
        </h2>
        <p
          style={{
            color: ON_SURFACE_VARIANT,
            fontSize: 16,
            marginTop: 6,
            textTransform: 'capitalize',
          }}
        >
          {dateStrPretty} · Bienvenido de nuevo a tu panel de socio.
        </p>
      </header>

      {/* KPI Row */}
      <section
        className="grid gap-6 mb-8"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        <KpiCard
          label="Deuda actual"
          value={fmtMoney(debt)}
          sub={
            debt > 0 ? (nextDueLabel ?? `${pendingInvoiceCount} factura(s) por pagar`) : 'Estás al día'
          }
          subColor={debt > 0 ? '#b91c1c' : '#047857'}
          icon={<WalletIcon size={22} />}
          iconBg="rgba(0,88,190,0.1)"
          iconColor={PRIMARY}
        />
        <KpiCard
          label="Próximos eventos"
          value={String(upcomingTeamEvents.length)}
          sub={upcomingTeamEvents.length > 0 ? 'Partidos y entrenos' : 'No tienes eventos próximos'}
          icon={<CalendarIcon size={22} />}
          iconBg="rgba(77,93,115,0.15)"
          iconColor={TERTIARY}
        />
        <KpiCard
          label="Mis equipos"
          value={String(teams.length)}
          sub={teams.length ? teams.map((t) => t.name).slice(0, 2).join(', ') : 'Aún no asignado'}
          icon={<GroupsIcon size={22} />}
          iconBg="rgba(87,94,112,0.15)"
          iconColor={SECONDARY}
        />
        <KpiCard
          label="Cuotas sin pagar"
          value={String(overdueCount)}
          sub={overdueCount > 0 ? 'Pendientes tras el día de cobro' : 'Todo en orden'}
          subColor={overdueCount > 0 ? '#b91c1c' : '#047857'}
          icon={<WarningIcon size={22} />}
          iconBg="rgba(186,26,26,0.12)"
          iconColor="#ba1a1a"
          accent={overdueCount > 0 ? '#ba1a1a' : undefined}
        />
      </section>

      {/* Main layout grid */}
      <div className="grid gap-6" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
        {/* Left column */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Upcoming events */}
          <section
            className="rounded-xl overflow-hidden"
            style={{ background: '#fff', boxShadow: SHADOW, border: BORDER }}
          >
            <div
              className="p-6 flex justify-between items-center"
              style={{ borderBottom: '1px solid rgba(194,198,214,0.25)' }}
            >
              <h3 style={{ fontWeight: 700, fontSize: 20, color: ON_SURFACE, margin: 0 }}>
                Próximos eventos de equipo
              </h3>
              <Link
                href="/calendar"
                style={{ color: PRIMARY, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
              >
                Ver calendario completo →
              </Link>
            </div>
            <div>
              {upcomingTeamEvents.length === 0 && (
                <div style={{ padding: '40px 24px', textAlign: 'center', color: OUTLINE }}>
                  No tienes eventos próximos en tus equipos.
                </div>
              )}
              {upcomingTeamEvents.map((event, i) => {
                const dt = new Date(event.date)
                const day = dt.getDate()
                const monthLabel = MONTHS_SHORT[dt.getMonth()].toUpperCase()
                return (
                  <div
                    key={event.id}
                    className="p-6 flex items-center gap-6"
                    style={{
                      borderTop: i === 0 ? 'none' : '1px solid rgba(194,198,214,0.18)',
                    }}
                  >
                    <div
                      className="flex flex-col items-center justify-center rounded-lg flex-shrink-0"
                      style={{
                        minWidth: 64,
                        height: 64,
                        background: SURFACE_CONTAINER,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 900,
                          color: OUTLINE,
                          letterSpacing: '0.08em',
                        }}
                      >
                        {monthLabel}
                      </span>
                      <span style={{ fontSize: 20, fontWeight: 700, color: PRIMARY }}>{day}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4
                        className="truncate"
                        style={{ fontWeight: 700, fontSize: 16, color: ON_SURFACE, margin: 0 }}
                      >
                        {event.title}
                      </h4>
                      <div
                        className="flex flex-wrap gap-4 mt-1"
                        style={{ color: ON_SURFACE_VARIANT, fontSize: 14 }}
                      >
                        <span className="flex items-center gap-1.5">
                          <ClockIcon size={16} />
                          {dt.toLocaleTimeString('es-ES', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {event.location && (
                          <span className="flex items-center gap-1.5">
                            <MapPinIcon size={16} />
                            {event.location}
                          </span>
                        )}
                        {event.teamName && (
                          <span
                            style={{
                              padding: '2px 10px',
                              borderRadius: 999,
                              background: 'rgba(0,88,190,0.08)',
                              color: PRIMARY,
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {event.teamName}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/calendar/${event.id}`}
                      style={{
                        padding: '8px 16px',
                        border: `1px solid ${PRIMARY}`,
                        color: PRIMARY,
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      Detalles
                    </Link>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Recent invoices */}
          <section
            className="rounded-xl overflow-hidden"
            style={{ background: '#fff', boxShadow: SHADOW, border: BORDER }}
          >
            <div
              className="p-6 flex justify-between items-center"
              style={{ borderBottom: '1px solid rgba(194,198,214,0.25)' }}
            >
              <h3 style={{ fontWeight: 700, fontSize: 20, color: ON_SURFACE, margin: 0 }}>
                Facturas recientes
              </h3>
              <Link
                href="/my-billing"
                style={{ color: PRIMARY, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
              >
                Ver todas →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(242,243,253,0.6)' }}>
                    <Th>Concepto</Th>
                    <Th>Monto</Th>
                    <Th>Fecha</Th>
                    <Th>Estado</Th>
                    <Th>{''}</Th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        style={{ padding: '32px 16px', textAlign: 'center', color: OUTLINE }}
                      >
                        No tienes facturas registradas.
                      </td>
                    </tr>
                  )}
                  {recentInvoices.map((inv) => {
                    const badge = memberInvoiceBadge(inv)
                    const styles = MEMBER_INVOICE_BADGE_STYLES[badge.tone]
                    const pending = Math.max(0, inv.totalAmount - inv.paidAmount)
                    return (
                      <tr
                        key={inv.id}
                        style={{ borderTop: '1px solid rgba(194,198,214,0.18)' }}
                      >
                        <Td style={{ fontWeight: 600, color: ON_SURFACE }}>{inv.invoiceNumber}</Td>
                        <Td>{fmtMoney(pending > 0 ? pending : inv.totalAmount)}</Td>
                        <Td>
                          {new Date(inv.issueDate).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </Td>
                        <Td>
                          <span
                            style={{
                              padding: '4px 12px',
                              borderRadius: 999,
                              background: styles.bg,
                              color: styles.color,
                              fontWeight: 700,
                              fontSize: 11,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            {badge.label}
                          </span>
                        </Td>
                        <Td style={{ textAlign: 'right' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 8,
                            }}
                          >
                            {pending > 0 && inv.status !== 'VOID' ? (
                              <PayMyInvoiceButton invoiceId={inv.id} />
                            ) : null}
                            <Link
                              href={`/api/invoices/${inv.id}/pdf`}
                              style={{ color: OUTLINE, textDecoration: 'none' }}
                              aria-label="Descargar factura"
                            >
                              <DownloadIcon size={18} />
                            </Link>
                          </div>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* My teams */}
          <section>
            <div className="mb-4 flex justify-between items-center">
              <h3 style={{ fontWeight: 700, fontSize: 20, color: ON_SURFACE, margin: 0 }}>
                Mis equipos
              </h3>
            </div>
            <div
              className="grid gap-6"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
            >
              {teams.length === 0 && (
                <div
                  className="rounded-xl p-6"
                  style={{
                    background: '#fff',
                    border: BORDER,
                    boxShadow: SHADOW,
                    color: OUTLINE,
                    textAlign: 'center',
                  }}
                >
                  Aún no estás asignado a ningún equipo.
                </div>
              )}
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="rounded-xl p-6 flex items-center gap-4"
                  style={{ background: '#fff', boxShadow: SHADOW, border: BORDER }}
                >
                  <div
                    className="rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      width: 64,
                      height: 64,
                      background: SURFACE_CONTAINER,
                      color: PRIMARY,
                    }}
                  >
                    <VolleyballIcon size={32} />
                  </div>
                  <div className="min-w-0">
                    <h4
                      className="truncate"
                      style={{ fontWeight: 700, fontSize: 16, color: ON_SURFACE, margin: 0 }}
                    >
                      {team.name}
                    </h4>
                    <p
                      style={{
                        color: ON_SURFACE_VARIANT,
                        fontSize: 13,
                        marginTop: 4,
                      }}
                    >
                      {team.role === 'COACH' ? 'Entrenador' : 'Jugador'} ·{' '}
                      {team.memberCount} miembro{team.memberCount === 1 ? '' : 's'}
                      {team.category ? ` · ${team.category}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* News */}
          <section
            className="rounded-xl overflow-hidden"
            style={{ background: '#fff', boxShadow: SHADOW, border: BORDER }}
          >
            <div
              className="p-6 flex justify-between items-center"
              style={{ borderBottom: '1px solid rgba(194,198,214,0.25)' }}
            >
              <h3 style={{ fontWeight: 700, fontSize: 20, color: ON_SURFACE, margin: 0 }}>
                Mural de noticias
              </h3>
              <Link
                href="/mural"
                style={{ color: PRIMARY, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
              >
                Ver todas →
              </Link>
            </div>
            <div className="p-6 flex flex-col gap-6">
              {news.length === 0 && (
                <div style={{ color: OUTLINE, fontSize: 14, textAlign: 'center' }}>
                  No hay noticias publicadas.
                </div>
              )}
              {news.map((post) => {
                const published = post.publishedAt || post.createdAt
                return (
                  <article key={post.id} className="cursor-pointer">
                    <div className="flex items-center gap-2 mb-1">
                      <h4
                        className="truncate flex-1"
                        style={{ fontWeight: 700, fontSize: 15, color: ON_SURFACE, margin: 0 }}
                      >
                        {post.title}
                      </h4>
                      {post.priority === 'HIGH' && (
                        <span
                          style={{
                            background: 'rgba(186,26,26,0.12)',
                            color: '#ba1a1a',
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                          }}
                        >
                          Destacada
                        </span>
                      )}
                    </div>
                    <p
                      className="line-clamp-2"
                      style={{
                        fontSize: 13,
                        color: ON_SURFACE_VARIANT,
                        margin: 0,
                        lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {post.content}
                    </p>
                    <div style={{ fontSize: 11, color: OUTLINE, marginTop: 8 }}>
                      {new Date(published).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          {/* Public events */}
          <section
            className="rounded-xl overflow-hidden"
            style={{ background: '#fff', boxShadow: SHADOW, border: BORDER }}
          >
            <div
              className="p-6 flex justify-between items-center"
              style={{ borderBottom: '1px solid rgba(194,198,214,0.25)' }}
            >
              <h3 style={{ fontWeight: 700, fontSize: 20, color: ON_SURFACE, margin: 0 }}>
                Eventos públicos
              </h3>
            </div>
            <div className="p-6 flex flex-col gap-3">
              {publicEvents.length === 0 && (
                <div style={{ color: OUTLINE, fontSize: 14, textAlign: 'center' }}>
                  No hay eventos públicos próximos.
                </div>
              )}
              {publicEvents.map((event) => {
                const dt = new Date(event.date)
                const isSocial = event.type === 'SOCIAL'
                const icon = isSocial ? <ConfettiIcon size={20} /> : <VolleyballIcon size={20} />
                const bg = isSocial ? 'rgba(87,94,112,0.18)' : 'rgba(77,93,115,0.18)'
                const fg = isSocial ? SECONDARY : TERTIARY
                return (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg"
                    style={{ textDecoration: 'none', transition: 'background 0.15s' }}
                  >
                    <div
                      className="rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        width: 48,
                        height: 48,
                        background: bg,
                        color: fg,
                      }}
                    >
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="truncate"
                        style={{ fontWeight: 700, fontSize: 14, color: ON_SURFACE, margin: 0 }}
                      >
                        {event.title}
                      </p>
                      <p style={{ fontSize: 12, color: OUTLINE, marginTop: 2 }}>
                        {eventTypeLabel(event.type)} ·{' '}
                        {dt.toLocaleDateString('es-ES', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        ·{' '}
                        {dt.toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </Link>
                )
              })}
              <Link
                href="/calendar"
                className="block text-center mt-2 py-3 rounded-xl"
                style={{
                  border: `2px dashed ${OUTLINE_VARIANT}`,
                  color: OUTLINE,
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Ver todos los eventos
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  subColor,
  icon,
  iconBg,
  iconColor,
  accent,
}: {
  label: string
  value: string
  sub: string
  subColor?: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  accent?: string
}) {
  return (
    <div
      className="rounded-xl flex flex-col justify-between"
      style={{
        background: '#fff',
        padding: '24px',
        boxShadow: SHADOW,
        border: BORDER,
        borderLeft: accent ? `4px solid ${accent}` : undefined,
      }}
    >
      <div className="flex justify-between items-start">
        <span
          style={{
            color: accent || OUTLINE,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <div
          className="rounded-lg flex items-center justify-center"
          style={{ background: iconBg, color: iconColor, padding: 8 }}
        >
          {icon}
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <p
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: accent || ON_SURFACE,
            margin: 0,
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
          }}
        >
          {value}
        </p>
        <p
          style={{
            fontSize: 12,
            color: subColor || OUTLINE,
            marginTop: 6,
            fontWeight: subColor ? 700 : 500,
          }}
        >
          {sub}
        </p>
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: '14px 24px',
        textAlign: 'left',
        fontSize: 11,
        fontWeight: 700,
        color: OUTLINE,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <td
      style={{
        padding: '14px 24px',
        fontSize: 14,
        color: ON_SURFACE_VARIANT,
        ...style,
      }}
    >
      {children}
    </td>
  )
}

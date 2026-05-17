import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { PayMyInvoiceButton } from './PayMyInvoiceButton'

export const dynamic = 'force-dynamic'

const ON_SURFACE = '#191b23'
const ON_SURFACE_VARIANT = '#424754'
const OUTLINE = '#727785'
const PRIMARY = '#0058be'
const SHADOW = '0 4px 10px rgba(0,0,0,0.04)'
const BORDER = '1px solid rgba(194,198,214,0.4)'

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n)
}

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  PAID: { bg: 'rgba(16,185,129,0.12)', color: '#047857', label: 'Pagada' },
  PENDING: { bg: 'rgba(245,158,11,0.12)', color: '#b45309', label: 'Pendiente' },
  PARTIAL: { bg: 'rgba(245,158,11,0.12)', color: '#b45309', label: 'Parcial' },
  OVERDUE: { bg: 'rgba(239,68,68,0.12)', color: '#b91c1c', label: 'Vencida' },
  VOID: { bg: '#f1f5f9', color: '#64748b', label: 'Anulada' },
}

export default async function MyBillingPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const memberId = (session.user as { memberId?: string | null })?.memberId

  const invoices = memberId
    ? await prisma.invoice.findMany({
        where: { memberId },
        orderBy: { issueDate: 'desc' },
      })
    : []

  const debt = invoices
    .filter((i) => i.status !== 'PAID' && i.status !== 'VOID')
    .reduce((acc, i) => acc + (i.totalAmount - i.paidAmount), 0)

  const overdueCount = invoices.filter((i) => i.status === 'OVERDUE').length
  const paidCount = invoices.filter((i) => i.status === 'PAID').length

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto' }}>
      <header style={{ marginBottom: 32 }}>
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
          Mis pagos
        </h1>
        <p style={{ color: ON_SURFACE_VARIANT, fontSize: 16, marginTop: 6 }}>
          Histórico de facturas, deuda y pagos pendientes.
        </p>
      </header>

      <section
        className="grid gap-6 mb-8"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        <StatCard
          label="Deuda actual"
          value={fmtMoney(debt)}
          sub={debt > 0 ? 'Por pagar' : 'Estás al día'}
          accent={debt > 0 ? '#ba1a1a' : '#047857'}
        />
        <StatCard
          label="Facturas vencidas"
          value={String(overdueCount)}
          sub={overdueCount > 0 ? 'Requieren atención' : 'Todo en orden'}
          accent={overdueCount > 0 ? '#ba1a1a' : '#047857'}
        />
        <StatCard
          label="Facturas pagadas"
          value={String(paidCount)}
          sub={`De ${invoices.length} totales`}
        />
        <StatCard
          label="Total facturas"
          value={String(invoices.length)}
          sub="Registradas en el sistema"
        />
      </section>

      <section
        className="rounded-xl overflow-hidden"
        style={{ background: '#fff', boxShadow: SHADOW, border: BORDER }}
      >
        <div
          className="p-6 flex justify-between items-center"
          style={{ borderBottom: '1px solid rgba(194,198,214,0.25)' }}
        >
          <h2 style={{ fontWeight: 700, fontSize: 20, color: ON_SURFACE, margin: 0 }}>
            Histórico de facturas
          </h2>
          <span style={{ fontSize: 13, color: OUTLINE }}>{invoices.length} facturas</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(242,243,253,0.6)' }}>
                <Th>Factura</Th>
                <Th>Emisión</Th>
                <Th>Vencimiento</Th>
                <Th>Total</Th>
                <Th>Pendiente</Th>
                <Th>Estado</Th>
                <Th>Acción</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: '40px 16px',
                      textAlign: 'center',
                      color: OUTLINE,
                      fontSize: 14,
                    }}
                  >
                    No tienes facturas registradas todavía.
                  </td>
                </tr>
              )}
              {invoices.map((invoice) => {
                const badge = STATUS_BADGE[invoice.status] || STATUS_BADGE.PENDING
                const pending = Math.max(0, invoice.totalAmount - invoice.paidAmount)
                const canPay = pending > 0 && invoice.status !== 'VOID'
                return (
                  <tr
                    key={invoice.id}
                    style={{ borderTop: '1px solid rgba(194,198,214,0.18)' }}
                  >
                    <Td style={{ fontWeight: 600, color: ON_SURFACE }}>
                      {invoice.invoiceNumber}
                    </Td>
                    <Td>
                      {new Date(invoice.issueDate).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </Td>
                    <Td>
                      {new Date(invoice.dueDate).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </Td>
                    <Td>{fmtMoney(invoice.totalAmount)}</Td>
                    <Td style={{ fontWeight: 600, color: pending > 0 ? '#b91c1c' : ON_SURFACE_VARIANT }}>
                      {fmtMoney(pending)}
                    </Td>
                    <Td>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: 999,
                          background: badge.bg,
                          color: badge.color,
                          fontWeight: 700,
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {badge.label}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        {canPay && <PayMyInvoiceButton invoiceId={invoice.id} />}
                        <a
                          href={`/api/invoices/${invoice.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: PRIMARY,
                            fontSize: 13,
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          PDF
                        </a>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub: string
  accent?: string
}) {
  return (
    <div
      className="rounded-xl"
      style={{
        background: '#fff',
        padding: '24px',
        boxShadow: SHADOW,
        border: BORDER,
        borderLeft: accent ? `4px solid ${accent}` : undefined,
      }}
    >
      <span
        style={{
          color: OUTLINE,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <p
        style={{
          fontSize: 32,
          fontWeight: 800,
          color: accent || ON_SURFACE,
          margin: 0,
          marginTop: 12,
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </p>
      <p
        style={{
          fontSize: 12,
          color: accent || OUTLINE,
          marginTop: 4,
          fontWeight: 600,
        }}
      >
        {sub}
      </p>
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

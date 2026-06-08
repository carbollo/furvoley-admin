import * as Linking from 'expo-linking'
import { useCallback, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { LogoutButton } from '@/components/LogoutButton'
import {
  AppScreen,
  Badge,
  Card,
  EmptyState,
  ErrorView,
  ListRow,
  LoadingView,
  PrimaryButton,
  SectionTitle,
} from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useClub } from '@/context/ClubContext'
import { createInvoiceCheckout, getBilling } from '@/lib/crm-api'
import { clubPrimary, fmtDate, fmtMoney } from '@/lib/theme'

function invoiceTone(status: string, pastDue?: boolean) {
  if (status === 'PAID') return 'ok' as const
  if (pastDue || status === 'OVERDUE') return 'danger' as const
  return 'neutral' as const
}

function invoiceLabel(status: string, pastDue?: boolean) {
  if (status === 'PAID') return 'Pagada'
  if (status === 'VOID') return 'Anulada'
  if (pastDue) return 'Vencida'
  if (status === 'PARTIAL') return 'Parcial'
  return 'Pendiente'
}

export default function MemberBillingScreen() {
  const { session } = useAuth()
  const { branding } = useClub()
  const primary = clubPrimary(branding)
  const [debt, setDebt] = useState(0)
  const [invoices, setInvoices] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    setError('')
    try {
      const d = await getBilling(session)
      setDebt(Number(d.debt || 0))
      setInvoices((d.invoices as Array<Record<string, unknown>>) || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  async function payInvoice(id: string) {
    if (!session) return
    setPayingId(id)
    try {
      const { url } = await createInvoiceCheckout(session, id)
      await Linking.openURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar el pago')
    } finally {
      setPayingId(null)
    }
  }

  if (loading) return <LoadingView />
  if (error && invoices.length === 0) return <ErrorView message={error} onRetry={() => void load()} />

  return (
    <AppScreen
      title="Mis pagos"
      subtitle="Facturas y cuotas del club"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        void load()
      }}
      headerRight={<LogoutButton />}
    >
      <Card style={{ backgroundColor: primary, borderColor: primary }}>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>Deuda total</Text>
        <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 6 }}>{fmtMoney(debt)}</Text>
      </Card>

      {error ? <ListRow title={error} subtitle="Revisa la conexión e inténtalo de nuevo." /> : null}

      {invoices.length === 0 ? (
        <EmptyState title="Sin facturas" body="Cuando el club emita una factura la verás aquí." />
      ) : (
        <>
          <SectionTitle>Facturas</SectionTitle>
          {invoices.map((inv) => {
            const status = String(inv.status)
            const pastDue = Boolean(inv.pastDue)
            const canPay = status !== 'PAID' && status !== 'VOID'
            return (
              <Card key={String(inv.id)}>
                <ListRow
                  title={String(inv.invoiceNumber)}
                  subtitle={`${fmtMoney(Number(inv.totalAmount))} · vence ${fmtDate(String(inv.dueDate))}`}
                />
                <Badge label={invoiceLabel(status, pastDue)} tone={invoiceTone(status, pastDue)} />
                {canPay ? (
                  <View style={{ marginTop: 12 }}>
                    <PrimaryButton
                      label={payingId === String(inv.id) ? 'Abriendo pago…' : 'Pagar con tarjeta'}
                      disabled={payingId === String(inv.id)}
                      onPress={() => void payInvoice(String(inv.id))}
                    />
                  </View>
                ) : null}
              </Card>
            )
          })}
        </>
      )}
    </AppScreen>
  )
}

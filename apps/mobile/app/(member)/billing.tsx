import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getBilling } from '@/lib/crm-api'

export default function MemberBillingScreen() {
  const { session } = useAuth()
  const [debt, setDebt] = useState(0)
  const [invoices, setInvoices] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    getBilling(session)
      .then((d) => {
        setDebt(Number(d.debt || 0))
        setInvoices((d.invoices as Array<Record<string, unknown>>) || [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false))
  }, [session])

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color="#0058be" />
  if (error) return <Text style={styles.error}>{error}</Text>

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Deuda total</Text>
        <Text style={styles.summaryValue}>{debt.toFixed(2)} €</Text>
      </View>
      {invoices.map((inv) => (
        <View key={String(inv.id)} style={styles.card}>
          <Text style={styles.title}>{String(inv.invoiceNumber)}</Text>
          <Text style={styles.meta}>
            {Number(inv.totalAmount).toFixed(2)} € · {String(inv.status)}
          </Text>
          <Text style={styles.meta}>Vence: {new Date(String(inv.dueDate)).toLocaleDateString('es-ES')}</Text>
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ecedf7' },
  summary: { backgroundColor: '#0058be', borderRadius: 14, padding: 16 },
  summaryLabel: { color: 'rgba(255,255,255,0.85)' },
  summaryValue: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontWeight: '700', color: '#191b23' },
  meta: { color: '#727785', marginTop: 4 },
  error: { color: '#be123c', padding: 16 },
})

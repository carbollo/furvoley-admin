import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getStaffDashboard } from '@/lib/crm-api'

export default function StaffDashboardScreen() {
  const { session } = useAuth()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    getStaffDashboard(session)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false))
  }, [session])

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color="#0058be" />
  if (error) return <Text style={styles.error}>{error}</Text>

  const kpis = (data?.kpis as Record<string, unknown>) || {}
  const cards = [
    ['Socios activos', kpis.sociosActivos],
    ['Socios morosos', kpis.sociosMorosos],
    ['Cobros pendientes', kpis.cobrosPendientes],
    ['Facturas vencidas', kpis.facturasVencidas],
  ]

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={styles.title}>Panel staff</Text>
      <Text style={styles.subtitle}>Hola, {session?.user.name || session?.user.email}</Text>
      {cards.map(([label, value]) => (
        <View key={String(label)} style={styles.card}>
          <Text style={styles.cardLabel}>{String(label)}</Text>
          <Text style={styles.cardValue}>{String(value ?? '—')}</Text>
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ecedf7' },
  title: { fontSize: 24, fontWeight: '800', color: '#191b23' },
  subtitle: { color: '#727785', marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  cardLabel: { color: '#727785' },
  cardValue: { fontSize: 24, fontWeight: '800', color: '#0058be', marginTop: 4 },
  error: { color: '#be123c', padding: 16 },
})

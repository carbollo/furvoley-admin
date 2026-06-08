import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getHome } from '@/lib/crm-api'

export default function MemberHomeScreen() {
  const { session } = useAuth()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    getHome(session)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false))
  }, [session])

  if (!session) return null
  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color="#0058be" />
  if (error) return <Text style={styles.error}>{error}</Text>

  const firstName = String(data?.firstName || 'Socio')
  const debt = Number(data?.debt || 0)
  const teams = (data?.teams as Array<{ name: string; role: string }>) || []
  const events = (data?.upcomingTeamEvents as Array<{ title: string; date: string }>) || []

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={styles.greeting}>Hola, {firstName}</Text>
      <Text style={styles.date}>{String(data?.dateStrPretty || '')}</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pagos</Text>
        <Text style={styles.cardValue}>{debt.toFixed(2)} € pendientes</Text>
        {data?.nextDueLabel ? <Text style={styles.muted}>{String(data.nextDueLabel)}</Text> : null}
      </View>
      {teams.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tus equipos</Text>
          {teams.map((t) => (
            <Text key={t.name} style={styles.row}>
              {t.name} · {t.role}
            </Text>
          ))}
        </View>
      ) : null}
      {events.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Próximos eventos</Text>
          {events.map((e) => (
            <Text key={`${e.title}-${e.date}`} style={styles.row}>
              {new Date(e.date).toLocaleDateString('es-ES')} — {e.title}
            </Text>
          ))}
        </View>
      ) : null}
      <Pressable style={styles.linkBtn} onPress={() => void Linking.openURL(session.tenantUrl)}>
        <Text style={styles.linkText}>Abrir panel web del club</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ecedf7' },
  greeting: { fontSize: 26, fontWeight: '800', color: '#191b23' },
  date: { color: '#424754', marginBottom: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(194,198,214,0.4)',
  },
  cardTitle: { fontWeight: '700', color: '#191b23', marginBottom: 8 },
  cardValue: { fontSize: 22, fontWeight: '800', color: '#0058be' },
  muted: { marginTop: 6, color: '#727785' },
  row: { color: '#424754', marginBottom: 6 },
  error: { color: '#be123c', padding: 16 },
  linkBtn: { alignItems: 'center', padding: 12 },
  linkText: { color: '#0058be', fontWeight: '600' },
})

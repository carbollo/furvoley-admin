import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getCalendar } from '@/lib/crm-api'

export default function MemberCalendarScreen() {
  const { session } = useAuth()
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    getCalendar(session)
      .then((d) => setEvents((d.events as Array<Record<string, unknown>>) || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false))
  }, [session])

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color="#0058be" />
  if (error) return <Text style={styles.error}>{error}</Text>

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 10 }}>
      {events.length === 0 ? (
        <Text style={styles.empty}>No hay eventos próximos.</Text>
      ) : (
        events.map((e) => (
          <View key={String(e.id)} style={styles.card}>
            <Text style={styles.title}>{String(e.title)}</Text>
            <Text style={styles.meta}>
              {new Date(String(e.date)).toLocaleString('es-ES')} · {String(e.type)}
            </Text>
            {e.teamName ? <Text style={styles.meta}>{String(e.teamName)}</Text> : null}
            {e.location ? <Text style={styles.meta}>{String(e.location)}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ecedf7' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontWeight: '700', color: '#191b23', fontSize: 16 },
  meta: { color: '#727785', marginTop: 4 },
  empty: { color: '#727785', textAlign: 'center', marginTop: 24 },
  error: { color: '#be123c', padding: 16 },
})

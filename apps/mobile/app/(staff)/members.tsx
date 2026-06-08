import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getStaffMembers } from '@/lib/crm-api'

export default function StaffMembersScreen() {
  const { session } = useAuth()
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    getStaffMembers(session)
      .then((d) => setMembers((d.socios as Array<Record<string, unknown>>) || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false))
  }, [session])

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color="#0058be" />
  if (error) return <Text style={styles.error}>{error}</Text>

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 8 }}>
      {members.map((m) => (
        <View key={String(m.id)} style={styles.card}>
          <Text style={styles.title}>{String(m.nombre || m.name || 'Socio')}</Text>
          <Text style={styles.meta}>{String(m.email || '—')}</Text>
          {m.estado ? <Text style={styles.meta}>{String(m.estado)}</Text> : null}
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ecedf7' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontWeight: '700', color: '#191b23' },
  meta: { color: '#727785', marginTop: 4 },
  error: { color: '#be123c', padding: 16 },
})

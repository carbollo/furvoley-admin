import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { isStaffRole } from '@/context/AuthContext'

export default function PickClubScreen() {
  const { pendingPick, pickClub } = useAuth()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!pendingPick) {
    router.replace('/login')
    return null
  }

  async function choose(tenantId: string) {
    setBusy(true)
    setError('')
    try {
      const result = await pickClub(tenantId, pendingPick.email, pendingPick.password)
      if (result === 'change-password') {
        router.replace('/change-password')
        return
      }
      const session = await import('@/lib/auth-storage').then((m) => m.loadSession())
      router.replace(isStaffRole(session?.user.role || 'MEMBER') ? '/(staff)' : '/(member)')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Elige tu club</Text>
      <Text style={styles.subtitle}>Esta cuenta existe en varios clubs.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ScrollView contentContainerStyle={{ gap: 10 }}>
        {pendingPick.tenants.map((t) => (
          <Pressable key={t.id} style={styles.item} disabled={busy} onPress={() => void choose(t.id)}>
            <Text style={styles.itemTitle}>{t.name}</Text>
            <Text style={styles.itemUrl}>{t.url}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc', padding: 24, paddingTop: 64 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, marginBottom: 20, color: '#64748b' },
  error: { color: '#be123c', marginBottom: 12 },
  item: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  itemTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  itemUrl: { marginTop: 4, color: '#64748b', fontSize: 12 },
})

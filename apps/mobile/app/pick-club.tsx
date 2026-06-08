import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { isStaffRole, useAuth } from '@/context/AuthContext'
import { theme } from '@/lib/theme'

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
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Elige tu club</Text>
      <Text style={styles.subtitle}>Esta cuenta existe en varios clubs.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {pendingPick.tenants.map((t) => (
          <Pressable key={t.id} style={styles.item} disabled={busy} onPress={() => void choose(t.id)}>
            <Text style={styles.itemTitle}>{t.name}</Text>
            <Text style={styles.itemHint}>Pulsa para entrar en este club</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, padding: 24 },
  title: { fontSize: 28, fontWeight: '800', color: theme.text, marginTop: 12 },
  subtitle: { marginTop: 8, marginBottom: 20, color: theme.textMuted, lineHeight: 20 },
  error: { color: theme.danger, marginBottom: 12 },
  item: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadow,
  },
  itemTitle: { fontSize: 17, fontWeight: '800', color: theme.text },
  itemHint: { marginTop: 6, color: theme.textMuted, fontSize: 13 },
})

import { StyleSheet, Text, View } from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Field, PrimaryButton } from '@/components/ui'
import { isStaffRole, useAuth } from '@/context/AuthContext'
import { changePassword } from '@/lib/crm-api'
import { theme } from '@/lib/theme'

export default function ChangePasswordScreen() {
  const { session, refreshSession } = useAuth()
  const router = useRouter()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!session) return null

  async function onSubmit() {
    setError('')
    setBusy(true)
    try {
      await changePassword(session, { newPassword, confirmPassword })
      await refreshSession()
      const updated = await import('@/lib/auth-storage').then((m) => m.loadSession())
      if (updated) {
        updated.user.mustChangePassword = false
        await import('@/lib/auth-storage').then((m) => m.saveSession(updated))
      }
      router.replace(isStaffRole(session.user.role) ? '/(staff)' : '/(member)')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Cambia tu contraseña</Text>
        <Text style={styles.subtitle}>Debes actualizar la contraseña antes de continuar.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Field label="Nueva contraseña" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
        <Field label="Confirmar contraseña" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
        <PrimaryButton label={busy ? 'Guardando…' : 'Guardar y continuar'} disabled={busy} onPress={() => void onSubmit()} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, padding: 24, justifyContent: 'center' },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.border,
  },
  title: { fontSize: 24, fontWeight: '800', color: theme.text },
  subtitle: { marginTop: 8, marginBottom: 16, color: theme.textMuted, lineHeight: 20 },
  error: { color: theme.danger, marginBottom: 12 },
})

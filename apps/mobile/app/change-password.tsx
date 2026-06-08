import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { isStaffRole, useAuth } from '@/context/AuthContext'
import { changePassword } from '@/lib/crm-api'

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
    <View style={styles.screen}>
      <Text style={styles.title}>Cambia tu contraseña</Text>
      <Text style={styles.subtitle}>Debes actualizar la contraseña antes de continuar.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TextInput
        secureTextEntry
        placeholder="Nueva contraseña"
        value={newPassword}
        onChangeText={setNewPassword}
        style={styles.input}
      />
      <TextInput
        secureTextEntry
        placeholder="Confirmar contraseña"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        style={styles.input}
      />
      <Pressable style={styles.button} disabled={busy} onPress={() => void onSubmit()}>
        <Text style={styles.buttonText}>{busy ? 'Guardando…' : 'Guardar'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc', padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, marginBottom: 20, color: '#64748b' },
  error: { color: '#be123c', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#0058be',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
})

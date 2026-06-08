import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { isStaffRole, useAuth } from '@/context/AuthContext'
import { loadSession } from '@/lib/auth-storage'
import { getPortalUrl } from '@/lib/config'

export default function LoginScreen() {
  const { login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit() {
    setError('')
    setBusy(true)
    try {
      const result = await login(email.trim(), password)
      if (result === 'pick-club') {
        router.push('/pick-club')
        return
      }
      if (result === 'change-password') {
        router.replace('/change-password')
        return
      }
      const stored = await loadSession()
      router.replace(isStaffRole(stored?.user.role || 'MEMBER') ? '/(staff)' : '/(member)')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de inicio de sesión')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Furvoley</Text>
        <Text style={styles.subtitle}>Inicia sesión y te llevaremos al panel de tu club.</Text>
        {!getPortalUrl() ? (
          <Text style={styles.error}>Define EXPO_PUBLIC_PORTAL_URL en apps/mobile/.env</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.label}>Correo electrónico</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />
        <Text style={styles.label}>Contraseña</Text>
        <TextInput secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
        <Pressable style={[styles.button, busy && styles.buttonDisabled]} disabled={busy} onPress={onSubmit}>
          <Text style={styles.buttonText}>{busy ? 'Entrando…' : 'Entrar'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', color: '#0f172a' },
  subtitle: { marginTop: 8, marginBottom: 20, textAlign: 'center', color: '#64748b', lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#0058be',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#be123c', marginBottom: 12, lineHeight: 20 },
})

import { StyleSheet, Text, View } from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Field, PrimaryButton } from '@/components/ui'
import { isStaffRole, useAuth } from '@/context/AuthContext'
import { loadSession } from '@/lib/auth-storage'
import { getPortalUrl } from '@/lib/config'
import { theme } from '@/lib/theme'

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
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.brand}>Furvoley</Text>
        <Text style={styles.tagline}>Tu club en el móvil</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Iniciar sesión</Text>
        <Text style={styles.subtitle}>Accede con tu cuenta del portal central.</Text>
        {!getPortalUrl() ? (
          <Text style={styles.error}>Define EXPO_PUBLIC_PORTAL_URL en apps/mobile/.env</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Field
          label="Correo electrónico"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field label="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />
        <PrimaryButton label={busy ? 'Entrando…' : 'Entrar'} disabled={busy} onPress={() => void onSubmit()} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.navy, padding: 24, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: 28 },
  brand: { color: '#fff', fontSize: 34, fontWeight: '900' },
  tagline: { color: 'rgba(255,255,255,0.72)', marginTop: 6, fontSize: 15 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.border,
  },
  title: { fontSize: 22, fontWeight: '800', color: theme.text },
  subtitle: { marginTop: 6, marginBottom: 16, color: theme.textMuted, lineHeight: 20 },
  error: { color: theme.danger, marginBottom: 12, lineHeight: 20 },
})

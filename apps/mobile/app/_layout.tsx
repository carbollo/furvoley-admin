import { Stack, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, routeForSession, useAuth } from '@/context/AuthContext'
import { ClubProvider } from '@/context/ClubContext'
import { LoadingView } from '@/components/ui'

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    const inAuth = segments[0] === 'login' || segments[0] === 'pick-club' || segments[0] === 'change-password'
    const target = routeForSession(session)

    if (!session && !inAuth) {
      router.replace('/login')
      return
    }

    if (session && inAuth && target !== `/${segments.join('/')}`) {
      router.replace(target as never)
    }
  }, [session, loading, segments, router])

  if (loading) return <LoadingView label="Iniciando app…" />

  return <>{children}</>
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ClubProvider>
          <AuthGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="login" />
              <Stack.Screen name="pick-club" />
              <Stack.Screen name="change-password" />
              <Stack.Screen name="(member)" />
              <Stack.Screen name="(staff)" />
            </Stack>
          </AuthGate>
        </ClubProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}

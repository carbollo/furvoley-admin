import { Stack, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { AuthProvider, routeForSession, useAuth } from '@/context/AuthContext'

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

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#0058be" />
      </View>
    )
  }

  return <>{children}</>
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="pick-club" />
          <Stack.Screen name="change-password" />
          <Stack.Screen name="(member)" />
          <Stack.Screen name="(staff)" />
        </Stack>
      </AuthGate>
    </AuthProvider>
  )
}

import { Tabs, useRouter } from 'expo-router'
import { Linking, Pressable, Text } from 'react-native'
import { useAuth } from '@/context/AuthContext'

function HeaderActions() {
  const { logout, session } = useAuth()
  const router = useRouter()
  return (
    <>
      {session ? (
        <Pressable onPress={() => void Linking.openURL(session.tenantUrl)} style={{ marginRight: 12 }}>
          <Text style={{ color: '#0058be', fontWeight: '600' }}>Web</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => void logout().then(() => router.replace('/login'))}
        style={{ marginRight: 12 }}
      >
        <Text style={{ color: '#0058be', fontWeight: '600' }}>Salir</Text>
      </Pressable>
    </>
  )
}

export default function StaffLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#141b2b' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: '#0058be',
        headerRight: () => <HeaderActions />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarLabel: 'Inicio' }} />
      <Tabs.Screen name="members" options={{ title: 'Socios' }} />
      <Tabs.Screen name="teams" options={{ title: 'Equipos' }} />
    </Tabs>
  )
}

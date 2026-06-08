import { Tabs, useRouter } from 'expo-router'
import { Pressable, Text } from 'react-native'
import { useAuth } from '@/context/AuthContext'

function LogoutButton() {
  const { logout } = useAuth()
  const router = useRouter()
  return (
    <Pressable
      onPress={() => void logout().then(() => router.replace('/login'))}
      style={{ marginRight: 12 }}
    >
      <Text style={{ color: '#0058be', fontWeight: '600' }}>Salir</Text>
    </Pressable>
  )
}

export default function MemberLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#141b2b' },
        headerTintColor: '#fff',
        tabBarActiveTintColor: '#0058be',
        headerRight: () => <LogoutButton />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarLabel: 'Inicio' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendario' }} />
      <Tabs.Screen name="billing" options={{ title: 'Mis Pagos' }} />
      <Tabs.Screen name="mural" options={{ title: 'Mural' }} />
    </Tabs>
  )
}

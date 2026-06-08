import { Pressable, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import { theme } from '@/lib/theme'

export function LogoutButton() {
  const { logout } = useAuth()
  const router = useRouter()
  return (
    <Pressable
      onPress={() => void logout().then(() => router.replace('/login'))}
      style={{ paddingHorizontal: 10, paddingVertical: 6 }}
    >
      <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '600', fontSize: 14 }}>Salir</Text>
    </Pressable>
  )
}

export function LogoutButtonGhost() {
  const { logout } = useAuth()
  const router = useRouter()
  return (
    <Pressable
      onPress={() => void logout().then(() => router.replace('/login'))}
      style={{ marginTop: 16, alignItems: 'center' }}
    >
      <Text style={{ color: theme.textMuted, fontWeight: '600' }}>Cerrar sesión</Text>
    </Pressable>
  )
}

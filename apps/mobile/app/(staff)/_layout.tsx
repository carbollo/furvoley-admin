import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import { theme } from '@/lib/theme'

export default function StaffLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => <Ionicons name="speedometer-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: 'Socios',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          title: 'Equipos',
          tabBarIcon: ({ color, size }) => <Ionicons name="shirt-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  )
}

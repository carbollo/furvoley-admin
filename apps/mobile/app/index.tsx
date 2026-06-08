import { Redirect } from 'expo-router'
import { routeForSession, useAuth } from '@/context/AuthContext'

export default function Index() {
  const { session, loading } = useAuth()
  if (loading) return null
  return <Redirect href={routeForSession(session) as never} />
}

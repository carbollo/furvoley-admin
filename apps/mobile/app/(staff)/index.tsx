import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { LogoutButton } from '@/components/LogoutButton'
import { AppScreen, ErrorView, LoadingView, SectionTitle, StatCard } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { getStaffDashboard } from '@/lib/crm-api'

export default function StaffDashboardScreen() {
  const { session } = useAuth()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    setError('')
    try {
      setData(await getStaffDashboard(session))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <LoadingView />
  if (error) return <ErrorView message={error} onRetry={() => void load()} />

  const kpis = (data?.kpis as Record<string, unknown>) || {}

  return (
    <AppScreen
      title="Panel staff"
      subtitle={`Hola, ${session?.user.name || session?.user.email}`}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        void load()
      }}
      headerRight={<LogoutButton />}
    >
      <SectionTitle>Resumen del club</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <StatCard label="Socios activos" value={String(kpis.sociosActivos ?? '—')} tone="primary" />
        <StatCard label="Socios morosos" value={String(kpis.sociosMorosos ?? '—')} tone="danger" />
        <StatCard label="Cobros pendientes" value={String(kpis.cobrosPendientes ?? '—')} />
        <StatCard label="Facturas vencidas" value={String(kpis.facturasVencidas ?? '—')} tone="danger" />
      </View>
    </AppScreen>
  )
}

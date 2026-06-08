import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { LogoutButton } from '@/components/LogoutButton'
import {
  AppScreen,
  Card,
  EmptyState,
  ErrorView,
  ListRow,
  LoadingView,
  PrimaryButton,
  SectionTitle,
  StatCard,
} from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { getHome } from '@/lib/crm-api'
import { fmtDate, fmtMoney, theme } from '@/lib/theme'

export default function MemberHomeScreen() {
  const { session } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    setError('')
    try {
      setData(await getHome(session))
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

  if (!session) return null
  if (loading) return <LoadingView />
  if (error) return <ErrorView message={error} onRetry={() => void load()} />

  const firstName = String(data?.firstName || 'Socio')
  const debt = Number(data?.debt || 0)
  const teams = (data?.teams as Array<{ name: string; role: string }>) || []
  const events = (data?.upcomingTeamEvents as Array<{ title: string; date: string }>) || []

  return (
    <AppScreen
      title={`Hola, ${firstName}`}
      subtitle={String(data?.dateStrPretty || '')}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        void load()
      }}
      headerRight={<LogoutButton />}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <StatCard label="Deuda pendiente" value={fmtMoney(debt)} tone={debt > 0 ? 'danger' : 'primary'} />
        <StatCard label="Equipos" value={String(teams.length)} tone="primary" />
      </View>

      {debt > 0 ? (
        <PrimaryButton label="Ver mis pagos" onPress={() => router.push('/(member)/billing')} />
      ) : null}

      {data?.nextDueLabel ? (
        <Card>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>Próximo vencimiento</Text>
          <Text style={{ marginTop: 6, fontSize: 17, fontWeight: '700', color: theme.text }}>
            {String(data.nextDueLabel)}
          </Text>
        </Card>
      ) : null}

      {teams.length > 0 ? (
        <>
          <SectionTitle>Tus equipos</SectionTitle>
          {teams.map((t) => (
            <ListRow key={t.name} title={t.name} subtitle={t.role} />
          ))}
        </>
      ) : (
        <EmptyState title="Sin equipos asignados" body="Cuando te asignen a un equipo aparecerá aquí." />
      )}

      {events.length > 0 ? (
        <>
          <SectionTitle>Próximos eventos</SectionTitle>
          {events.map((e) => (
            <ListRow key={`${e.title}-${e.date}`} title={e.title} subtitle={fmtDate(e.date)} />
          ))}
        </>
      ) : null}
    </AppScreen>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { LogoutButton } from '@/components/LogoutButton'
import { AppScreen, EmptyState, ErrorView, ListRow, LoadingView, SectionTitle } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { getCalendar } from '@/lib/crm-api'
import { fmtDateTime } from '@/lib/theme'

export default function MemberCalendarScreen() {
  const { session } = useAuth()
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    setError('')
    try {
      const d = await getCalendar(session)
      setEvents((d.events as Array<Record<string, unknown>>) || [])
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

  return (
    <AppScreen
      title="Calendario"
      subtitle="Entrenamientos, partidos y eventos del club"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        void load()
      }}
      headerRight={<LogoutButton />}
    >
      {events.length === 0 ? (
        <EmptyState title="Sin eventos próximos" body="No hay nada programado en las próximas semanas." />
      ) : (
        events.map((e) => (
          <ListRow
            key={String(e.id)}
            title={String(e.title)}
            subtitle={[fmtDateTime(String(e.date)), String(e.type)].filter(Boolean).join(' · ')}
            meta={[e.teamName ? String(e.teamName) : null, e.location ? String(e.location) : null]
              .filter(Boolean)
              .join(' · ')}
          />
        ))
      )}
      {events.length > 0 ? <SectionTitle>{`${events.length} eventos`}</SectionTitle> : null}
    </AppScreen>
  )
}

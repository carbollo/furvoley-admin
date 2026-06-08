import { useCallback, useEffect, useState } from 'react'
import { LogoutButton } from '@/components/LogoutButton'
import { AppScreen, EmptyState, ErrorView, ListRow, LoadingView, SectionTitle } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { getStaffTeams } from '@/lib/crm-api'

export default function StaffTeamsScreen() {
  const { session } = useAuth()
  const [teams, setTeams] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    setError('')
    try {
      const d = await getStaffTeams(session)
      setTeams((d.teams as Array<Record<string, unknown>>) || [])
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
      title="Equipos"
      subtitle={`${teams.length} equipos activos`}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        void load()
      }}
      headerRight={<LogoutButton />}
    >
      {teams.length === 0 ? (
        <EmptyState title="Sin equipos" body="Todavía no hay equipos registrados en el club." />
      ) : (
        teams.map((t) => (
          <ListRow
            key={String(t.id)}
            title={String(t.name)}
            subtitle={t.category ? String(t.category) : undefined}
            meta={`${String(t.memberCount ?? 0)} socios`}
          />
        ))
      )}
      {teams.length > 0 ? <SectionTitle>Equipos del club</SectionTitle> : null}
    </AppScreen>
  )
}

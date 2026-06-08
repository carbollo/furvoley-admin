import { useCallback, useEffect, useState } from 'react'
import { LogoutButton } from '@/components/LogoutButton'
import { AppScreen, EmptyState, ErrorView, ListRow, LoadingView, SectionTitle } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { getStaffMembers } from '@/lib/crm-api'

export default function StaffMembersScreen() {
  const { session } = useAuth()
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    setError('')
    try {
      const d = await getStaffMembers(session)
      setMembers((d.socios as Array<Record<string, unknown>>) || [])
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
      title="Socios"
      subtitle={`${members.length} socios en el club`}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        void load()
      }}
      headerRight={<LogoutButton />}
    >
      {members.length === 0 ? (
        <EmptyState title="Sin socios" body="No hay socios registrados todavía." />
      ) : (
        members.map((m) => (
          <ListRow
            key={String(m.id)}
            title={String(m.nombre || m.name || 'Socio')}
            subtitle={String(m.email || '—')}
            meta={m.estado ? String(m.estado) : undefined}
          />
        ))
      )}
      {members.length > 0 ? <SectionTitle>Listado del CRM</SectionTitle> : null}
    </AppScreen>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Text } from 'react-native'
import { LogoutButton } from '@/components/LogoutButton'
import { AppScreen, Card, EmptyState, ErrorView, LoadingView } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { getMural } from '@/lib/crm-api'
import { fmtDateTime, theme } from '@/lib/theme'

export default function MemberMuralScreen() {
  const { session } = useAuth()
  const [posts, setPosts] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    setError('')
    try {
      const d = await getMural(session)
      setPosts((d.posts as Array<Record<string, unknown>>) || [])
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
      title="Mural"
      subtitle="Noticias y avisos del club"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        void load()
      }}
      headerRight={<LogoutButton />}
    >
      {posts.length === 0 ? (
        <EmptyState title="Sin noticias" body="El club aún no ha publicado avisos en el mural." />
      ) : (
        posts.map((post) => (
          <Card key={String(post.id)}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: theme.text }}>{String(post.title)}</Text>
            <Text style={{ marginTop: 10, color: theme.textSecondary, lineHeight: 22 }}>{String(post.content)}</Text>
            {post.authorName || post.publishedAt ? (
              <Text style={{ marginTop: 10, color: theme.textMuted, fontSize: 12 }}>
                {[post.authorName ? String(post.authorName) : null, post.publishedAt ? fmtDateTime(String(post.publishedAt)) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
          </Card>
        ))
      )}
    </AppScreen>
  )
}

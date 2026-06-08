import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getMural } from '@/lib/crm-api'

export default function MemberMuralScreen() {
  const { session } = useAuth()
  const [posts, setPosts] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    getMural(session)
      .then((d) => setPosts((d.posts as Array<Record<string, unknown>>) || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false))
  }, [session])

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color="#0058be" />
  if (error) return <Text style={styles.error}>{error}</Text>

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 10 }}>
      {posts.length === 0 ? (
        <Text style={styles.empty}>No hay noticias publicadas.</Text>
      ) : (
        posts.map((post) => (
          <View key={String(post.id)} style={styles.card}>
            <Text style={styles.title}>{String(post.title)}</Text>
            <Text style={styles.content}>{String(post.content)}</Text>
            {post.authorName ? <Text style={styles.meta}>{String(post.authorName)}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ecedf7' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontWeight: '700', color: '#191b23', fontSize: 16 },
  content: { color: '#424754', marginTop: 8, lineHeight: 20 },
  meta: { color: '#727785', marginTop: 8, fontSize: 12 },
  empty: { color: '#727785', textAlign: 'center', marginTop: 24 },
  error: { color: '#be123c', padding: 16 },
})

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { clubPrimary, theme } from '@/lib/theme'
import { useClub } from '@/context/ClubContext'

export function LoadingView({ label = 'Cargando…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  )
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>No se pudo cargar</Text>
      <Text style={styles.errorMsg}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  )
}

export function AppScreen({
  title,
  subtitle,
  children,
  scroll = true,
  refreshing,
  onRefresh,
  headerRight,
  contentStyle,
}: {
  title?: string
  subtitle?: string
  children: React.ReactNode
  scroll?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  headerRight?: React.ReactNode
  contentStyle?: ViewStyle
}) {
  const { branding } = useClub()
  const primary = clubPrimary(branding)

  const header = (
    <View style={[styles.header, { backgroundColor: theme.navy }]}>
      <View style={{ flex: 1 }}>
        {branding?.name ? (
          <Text style={styles.clubName} numberOfLines={1}>
            {branding.name}
          </Text>
        ) : null}
        {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
        {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
      </View>
      {headerRight}
      <View style={[styles.headerAccent, { backgroundColor: primary }]} />
    </View>
  )

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={primary} /> : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }, contentStyle]}>{children}</View>
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header}
      {body}
    </SafeAreaView>
  )
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>
}

export function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'primary' | 'danger' }) {
  const { branding } = useClub()
  const valueColor =
    tone === 'primary' ? clubPrimary(branding) : tone === 'danger' ? theme.danger : theme.text
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
    </Card>
  )
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  variant = 'solid',
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  variant?: 'solid' | 'ghost'
}) {
  const { branding } = useClub()
  const primary = clubPrimary(branding)
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.btn,
        variant === 'solid' ? { backgroundColor: primary } : styles.btnGhost,
        disabled ? styles.btnDisabled : null,
      ]}
    >
      <Text style={[styles.btnText, variant === 'ghost' ? { color: primary } : null]}>{label}</Text>
    </Pressable>
  )
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor="#94a3b8" style={styles.fieldInput} {...props} />
    </View>
  )
}

export function ListRow({
  title,
  subtitle,
  meta,
  onPress,
}: {
  title: string
  subtitle?: string
  meta?: string
  onPress?: () => void
}) {
  const content = (
    <Card style={styles.listRow}>
      <Text style={styles.listTitle}>{title}</Text>
      {subtitle ? <Text style={styles.listSub}>{subtitle}</Text> : null}
      {meta ? <Text style={styles.listMeta}>{meta}</Text> : null}
    </Card>
  )
  if (!onPress) return content
  return <Pressable onPress={onPress}>{content}</Pressable>
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'danger' | 'ok' }) {
  const bg = tone === 'danger' ? '#fee2e2' : tone === 'ok' ? '#dcfce7' : '#eef2ff'
  const color = tone === 'danger' ? theme.danger : tone === 'ok' ? theme.success : theme.primary
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, position: 'relative' },
  headerAccent: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  clubName: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.78)', marginTop: 4, fontSize: 14 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.bg },
  loadingText: { marginTop: 12, color: theme.textMuted },
  errorTitle: { fontSize: 18, fontWeight: '700', color: theme.text },
  errorMsg: { marginTop: 8, textAlign: 'center', color: theme.textMuted, lineHeight: 20 },
  retryBtn: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.navy },
  retryText: { color: '#fff', fontWeight: '600' },
  empty: { padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.textSecondary },
  emptyBody: { marginTop: 6, textAlign: 'center', color: theme.textMuted, lineHeight: 20 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadow,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: theme.text, marginTop: 4, marginBottom: 2 },
  statCard: { flex: 1, minWidth: '46%' },
  statLabel: { color: theme.textMuted, fontSize: 13 },
  statValue: { marginTop: 6, fontSize: 22, fontWeight: '800' },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, color: theme.text },
  fieldInput: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.text,
  },
  listRow: { marginBottom: 0 },
  listTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  listSub: { marginTop: 4, color: theme.textSecondary, lineHeight: 20 },
  listMeta: { marginTop: 6, color: theme.textMuted, fontSize: 12 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },
})

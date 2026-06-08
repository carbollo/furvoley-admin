import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { clearSession, loadSession, saveSession } from '@/lib/auth-storage'
import { exchangeSsoToken, portalMobileLogin } from '@/lib/portal-api'
import type { AuthSession, TenantOption } from '@/lib/types'

type AuthContextValue = {
  session: AuthSession | null
  loading: boolean
  login: (email: string, password: string) => Promise<'ok' | 'pick-club' | 'change-password'>
  pickClub: (tenantId: string, email: string, password: string) => Promise<'ok' | 'change-password'>
  pendingPick: { email: string; password: string; tenants: TenantOption[] } | null
  setPendingPick: (value: { email: string; password: string; tenants: TenantOption[] } | null) => void
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function isStaffRole(role: string) {
  return role === 'ADMIN' || role === 'COACH' || role === 'TREASURER'
}

async function completeLogin(tenantUrl: string, ssoToken: string) {
  const exchanged = await exchangeSsoToken(tenantUrl, ssoToken)
  const session: AuthSession = {
    accessToken: exchanged.accessToken,
    tenantUrl,
    user: exchanged.user,
  }
  await saveSession(session)
  return session
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingPick, setPendingPick] = useState<{
    email: string
    password: string
    tenants: TenantOption[]
  } | null>(null)

  const refreshSession = useCallback(async () => {
    const stored = await loadSession()
    setSession(stored)
  }, [])

  useEffect(() => {
    refreshSession().finally(() => setLoading(false))
  }, [refreshSession])

  const login = useCallback(async (email: string, password: string) => {
    const result = await portalMobileLogin(email, password)
    if (result.kind === 'pick-club') {
      setPendingPick({ email, password, tenants: result.tenants })
      return 'pick-club' as const
    }
    const next = await completeLogin(result.tenant.url, result.ssoToken)
    setSession(next)
    return next.user.mustChangePassword ? ('change-password' as const) : ('ok' as const)
  }, [])

  const pickClub = useCallback(async (tenantId: string, email: string, password: string) => {
    const result = await portalMobileLogin(email, password, tenantId)
    if (result.kind !== 'ok') throw new Error('No se pudo seleccionar el club')
    const next = await completeLogin(result.tenant.url, result.ssoToken)
    setSession(next)
    setPendingPick(null)
    return next.user.mustChangePassword ? ('change-password' as const) : ('ok' as const)
  }, [])

  const logout = useCallback(async () => {
    await clearSession()
    setSession(null)
    setPendingPick(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      loading,
      login,
      pickClub,
      pendingPick,
      setPendingPick,
      logout,
      refreshSession,
    }),
    [session, loading, login, pickClub, pendingPick, logout, refreshSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function routeForSession(session: AuthSession | null) {
  if (!session) return '/login'
  if (session.user.mustChangePassword) return '/change-password'
  if (isStaffRole(session.user.role)) return '/(staff)'
  return '/(member)'
}

export { isStaffRole }

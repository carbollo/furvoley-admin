import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMe } from '@/lib/crm-api'
import type { ClubBranding } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'

type ClubContextValue = {
  branding: ClubBranding | null
  reloadClub: () => Promise<void>
  clubLoading: boolean
}

const ClubContext = createContext<ClubContextValue | null>(null)

export function ClubProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [branding, setBranding] = useState<ClubBranding | null>(null)
  const [clubLoading, setClubLoading] = useState(false)

  const reloadClub = useCallback(async () => {
    if (!session) {
      setBranding(null)
      return
    }
    setClubLoading(true)
    try {
      const data = await getMe(session)
      setBranding((data.branding as ClubBranding) || null)
    } catch {
      setBranding(null)
    } finally {
      setClubLoading(false)
    }
  }, [session])

  useEffect(() => {
    void reloadClub()
  }, [reloadClub])

  const value = useMemo(
    () => ({ branding, reloadClub, clubLoading }),
    [branding, reloadClub, clubLoading],
  )

  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>
}

export function useClub() {
  const ctx = useContext(ClubContext)
  if (!ctx) throw new Error('useClub must be used within ClubProvider')
  return ctx
}

import Constants from 'expo-constants'

export function getPortalUrl() {
  const fromEnv = String(process.env.EXPO_PUBLIC_PORTAL_URL || '').trim().replace(/\/+$/, '')
  if (fromEnv) return fromEnv
  const extra = Constants.expoConfig?.extra as { portalUrl?: string } | undefined
  return String(extra?.portalUrl || '').trim().replace(/\/+$/, '')
}

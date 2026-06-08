import { isPortalCentralHost } from '@/lib/portal-central/config'

/** NEXTAUTH_SECRET; en modo portal central puede reutilizar PORTAL_SSO_SECRET. */
export function resolveNextAuthSecret() {
  const explicit = String(process.env.NEXTAUTH_SECRET || '').trim()
  if (explicit) return explicit
  if (isPortalCentralHost()) {
    return String(process.env.PORTAL_SSO_SECRET || '').trim() || undefined
  }
  return undefined
}

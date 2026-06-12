let cached: string | undefined | null = null

/**
 * Secreto para firmar JWT/cookies de NextAuth.
 * Orden: NEXTAUTH_SECRET → PORTAL_SSO_SECRET (portal y CRMs lo comparten).
 * Sincroniza process.env.NEXTAUTH_SECRET para que next-auth no lance NO_SECRET.
 */
export function resolveNextAuthSecret(): string | undefined {
  if (cached !== null) return cached || undefined

  const explicit = String(process.env.NEXTAUTH_SECRET || '').trim()
  if (explicit) {
    cached = explicit
    return explicit
  }

  const sso = String(process.env.PORTAL_SSO_SECRET || '').trim()
  if (sso) {
    process.env.NEXTAUTH_SECRET = sso
    cached = sso
    return sso
  }

  cached = ''
  return undefined
}

/** Llamar al arranque (instrumentation) antes de cargar rutas auth. */
export function ensureNextAuthSecret(): string | undefined {
  return resolveNextAuthSecret()
}

import { decode } from 'next-auth/jwt'
import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveNextAuthSecret } from '@/lib/auth-secret'
import { normalizeRole } from '@/lib/rbac'
import { sessionMatchesActiveTenant } from '@/lib/tenant-session'

/**
 * Igual que getServerSession, pero si el JWT no se puede descifrar (secret
 * cambiado, cookie de otro deploy, etc.) devuelve null en lugar de tumbar la
 * página con 500.
 */
export async function getSafeServerSession(): Promise<Session | null> {
  try {
    const session = await getServerSession(authOptions)
    // El callback `session` (auth.ts) invalida session.user si la sesión no
    // pertenece al club activo; aquí lo normalizamos a null.
    if (!session?.user) return null
    return session
  } catch (err) {
    console.error('[auth] getServerSession failed:', (err as Error)?.message || err)
    return null
  }
}

function bearerTokenFromRequest(request: Request) {
  const header = String(request.headers.get('authorization') || '').trim()
  if (!header.toLowerCase().startsWith('bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}

/** Cookie session or Authorization Bearer JWT (mobile). */
export async function getSessionFromRequest(request?: Request): Promise<Session | null> {
  if (request) {
    const bearer = bearerTokenFromRequest(request)
    if (bearer) {
      try {
        const secret = resolveNextAuthSecret()
        if (!secret) return null
        const payload = await decode({ token: bearer, secret })
        if (!payload?.sub) return null
        const bearerSession = {
          user: {
            id: String(payload.sub),
            email: String(payload.email || ''),
            name: (payload.name as string | null | undefined) ?? null,
            role: normalizeRole(payload.role as string | undefined),
            memberId: (payload.memberId as string | null | undefined) ?? null,
            mustChangePassword: payload.mustChangePassword === true,
            tenant: (payload.tenant as string | null | undefined) ?? null,
            // La marca de emisión tiene que sobrevivir al desempaquetado: si se
            // pierde aquí, el corte de sesiones la lee como 0 y corta el acceso
            // móvil de forma permanente.
            authTime: typeof payload.authTime === 'number' ? payload.authTime : 0,
          },
          expires: payload.exp
            ? new Date(Number(payload.exp) * 1000).toISOString()
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        } as Session
        // SEGURIDAD cross-tenant: un Bearer de otro club no vale en este host.
        if (!(await sessionMatchesActiveTenant(bearerSession.user))) return null
        return bearerSession
      } catch {
        return null
      }
    }
  }

  return getSafeServerSession()
}

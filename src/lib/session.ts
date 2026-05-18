import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Igual que getServerSession, pero si el JWT no se puede descifrar (secret
 * cambiado, cookie de otro deploy, etc.) devuelve null en lugar de tumbar la
 * página con 500.
 */
export async function getSafeServerSession(): Promise<Session | null> {
  try {
    return await getServerSession(authOptions)
  } catch (err) {
    console.error('[auth] getServerSession failed:', (err as Error)?.message || err)
    return null
  }
}

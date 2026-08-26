import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Cifrado en reposo de las credenciales de la pasarela (AES-256-GCM).
 *
 * La API key de un club permite emitir cobros y transferir su dinero al banco:
 * no debe quedar en claro en la BD, donde la vería cualquier backup, réplica o
 * volcado. Se cifra con una clave derivada del entorno del servidor, así que un
 * volcado de la BD por sí solo no basta para usarla.
 *
 * Formato del valor cifrado: `encv1:<iv>:<tag>:<datos>` (todo en base64url). Un
 * valor sin ese prefijo se considera texto plano (compatibilidad hacia atrás).
 */

const PREFIX = 'encv1'

/** Clave de 32 bytes derivada del secreto del servidor. */
function encryptionKey(): Buffer | null {
  const raw =
    (process.env.WHOP_KEY_ENCRYPTION_KEY || '').trim() ||
    (process.env.NEXTAUTH_SECRET || '').trim() ||
    (process.env.PORTAL_SSO_SECRET || '').trim()
  if (!raw) return null
  // El secreto de entorno es una cadena arbitraria: se normaliza a 32 bytes.
  return createHash('sha256').update(`whop-secret-box:${raw}`).digest()
}

/** ¿Hay clave para cifrar? (si no, se guarda en claro y se avisa por log). */
export function canEncryptSecrets(): boolean {
  return encryptionKey() !== null
}

/** Cifra un secreto. Si no hay clave configurada, devuelve el valor tal cual. */
export function sealSecret(plain: string): string {
  const value = String(plain || '')
  if (!value) return ''
  const key = encryptionKey()
  if (!key) {
    console.warn('[whop] Sin WHOP_KEY_ENCRYPTION_KEY/NEXTAUTH_SECRET: la credencial se guarda SIN cifrar.')
    return value
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join(':')
}

/**
 * Descifra un secreto guardado. Acepta valores en claro (guardados antes de
 * activar el cifrado) y devuelve '' si el valor está corrupto o la clave no es
 * la que lo cifró.
 */
export function openSecret(stored: string): string {
  const value = String(stored || '')
  if (!value) return ''
  if (!value.startsWith(`${PREFIX}:`)) return value // texto plano heredado

  const key = encryptionKey()
  if (!key) return ''

  const parts = value.split(':')
  if (parts.length !== 4) return ''
  try {
    const iv = Buffer.from(parts[1], 'base64url')
    const tag = Buffer.from(parts[2], 'base64url')
    const data = Buffer.from(parts[3], 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    // Clave cambiada o dato manipulado: se trata como "sin credencial".
    return ''
  }
}

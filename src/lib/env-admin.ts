import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { PrismaClient } from '@/generated/prisma/client'
import bcrypt from 'bcryptjs'

/**
 * Administrador fijo definido en Railway (o .env).
 * Si `ADMIN_EMAIL` y `ADMIN_PASSWORD` están definidos, esas credenciales
 * son siempre las válidas y se sincronizan en la BD en cada arranque y login.
 */
export function getEnvAdminCredentials(): { email: string; password: string } | null {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD ?? ''
  if (!email || !password.trim()) return null
  return { email, password }
}

/**
 * Credenciales para bootstrap al arrancar.
 *
 * FUERA de desarrollo no se cae nunca a una contraseña por defecto: `admin123`
 * está en el código y en el README, así que crear con ella al administrador de
 * un despliegue nuevo es publicar sus llaves. Si falta `ADMIN_PASSWORD`, se
 * genera una al azar —el administrador entra por «he olvidado mi contraseña» o
 * poniendo la variable— y se avisa por consola.
 */
export function getBootstrapAdminCredentials(): { email: string; password: string } {
  const env = getEnvAdminCredentials()
  if (env) return env

  const email = (process.env.ADMIN_EMAIL || 'admin@furvoley.com').trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  if (password) return { email, password }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[env-admin] Falta ADMIN_PASSWORD: se crea el administrador con una contraseña aleatoria. ' +
        'Define ADMIN_PASSWORD para poder entrar con ella.',
    )
    return { email, password: randomBytes(24).toString('base64url') }
  }
  return { email, password: 'admin123' }
}

export function isEnvAdminConfigured(): boolean {
  return getEnvAdminCredentials() !== null
}

/** True si el email corresponde al admin fijo de ADMIN_EMAIL + ADMIN_PASSWORD. */
export function isEnvFixedAdminEmail(email: string | null | undefined): boolean {
  const env = getEnvAdminCredentials()
  if (!env || !email) return false
  return email.trim().toLowerCase() === env.email
}

export function credentialsMatchEnvAdmin(
  rawEmail: string,
  password: string,
): boolean {
  const env = getEnvAdminCredentials()
  if (!env) return false
  const normalized = rawEmail.trim().toLowerCase()
  if (normalized !== env.email) return false
  // Comparación en tiempo constante, como el resto de secretos del proyecto: es
  // la única contraseña que se comparaba con === y no cuesta nada igualarla.
  const a = Buffer.from(password)
  const b = Buffer.from(env.password)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Crea o actualiza el usuario ADMIN con la contraseña de las variables de entorno. */
export async function syncEnvAdminUser(prisma: PrismaClient): Promise<void> {
  const creds = getBootstrapAdminCredentials()
  const hashed = await bcrypt.hash(creds.password, 10)

  await prisma.user.upsert({
    where: { email: creds.email },
    update: {
      role: 'ADMIN',
      password: hashed,
      name: 'Administrador',
      mustChangePassword: false,
    },
    create: {
      name: 'Administrador',
      email: creds.email,
      password: hashed,
      role: 'ADMIN',
      mustChangePassword: false,
    },
  })
}

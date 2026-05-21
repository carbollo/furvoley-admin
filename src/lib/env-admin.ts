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

/** Credenciales para bootstrap al arrancar (env fijo o valores por defecto). */
export function getBootstrapAdminCredentials(): { email: string; password: string } {
  const env = getEnvAdminCredentials()
  if (env) return env
  return {
    email: (process.env.ADMIN_EMAIL || 'admin@furvoley.com').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'admin123',
  }
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
  return normalized === env.email && password === env.password
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

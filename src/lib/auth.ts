import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { normalizeRole } from "@/lib/rbac"
import {
  credentialsMatchEnvAdmin,
  getEnvAdminCredentials,
  syncEnvAdminUser,
} from "@/lib/env-admin"
import { ensureNextAuthSecret } from "@/lib/auth-secret"
import { enterTenantFromHeaders } from "@/lib/multitenant/request"
import { currentTenant } from "@/lib/multitenant/context"
import { isTenantSuspended } from "@/lib/tenant-status"
import {
  checkLoginRateLimit,
  loginRateKey,
  registerLoginFailure,
  resetLoginAttempts,
} from "@/lib/login-rate-limit"

const authSecret = ensureNextAuthSecret()

/** IP del cliente desde los headers (objeto plano) que next-auth pasa a authorize. */
function ipFromAuthorizeReq(req: unknown): string {
  const headers = (req as { headers?: Record<string, string> } | undefined)?.headers || {}
  const fwd = headers['x-forwarded-for']
  const first = typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : ''
  return first || headers['x-real-ip'] || headers['cf-connecting-ip'] || 'unknown'
}

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  // Nombre de cookie determinista por entorno (no depende de NEXTAUTH_URL, que en
  // multi-tenant varía por host): en producción `__Secure-next-auth.session-token`,
  // igual que emite el SSO del portal (buildPortalSessionCookie).
  useSecureCookies: process.env.NODE_ENV === 'production',
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        // Multi-tenant: activa la BD del club (por subdominio) ANTES de cualquier
        // consulta. Debe ir aquí, síncrono, porque /api/auth no pasa por el
        // middleware. Sin esto, el login por credenciales no sabría qué BD mirar.
        enterTenantFromHeaders(req?.headers as Record<string, string | string[] | undefined> | undefined)

        // Club suspendido → nadie entra por credenciales (el soporte usa "entrar
        // como" desde el super-admin, que va por SSO, no por aquí). El estado vive
        // en la BD del portal; lo leemos con caché. Fail-open ante un fallo de BD.
        const activeSlug = currentTenant()?.slug
        if (activeSlug && (await isTenantSuspended(activeSlug))) {
          throw new Error('Este club está suspendido. Contacta con el administrador de la plataforma.')
        }

        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const rawEmail = String(credentials.email).trim()
        const normalizedEmail = rawEmail.toLowerCase()
        const password = String(credentials.password)

        // Anti fuerza bruta: bloquea tras demasiados fallos por IP+email.
        const rlKey = loginRateKey(ipFromAuthorizeReq(req), normalizedEmail)
        const rl = checkLoginRateLimit(rlKey)
        if (!rl.ok) {
          throw new Error('Demasiados intentos. Inténtalo de nuevo en unos minutos.')
        }

        // Administrador fijo: ADMIN_EMAIL + ADMIN_PASSWORD en Railway siempre válidos.
        if (credentialsMatchEnvAdmin(rawEmail, password)) {
          await syncEnvAdminUser(prisma)
          const env = getEnvAdminCredentials()!
          const fixed = await prisma.user.findUnique({ where: { email: env.email } })
          if (fixed) {
            resetLoginAttempts(rlKey)
            return {
              id: fixed.id,
              email: fixed.email,
              name: fixed.name,
              role: normalizeRole(fixed.role),
              memberId: fixed.memberId,
              mustChangePassword: false,
            }
          }
        }

        let user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        })
        if (!user && rawEmail !== normalizedEmail) {
          user = await prisma.user.findUnique({ where: { email: rawEmail } })
        }
        if (!user) {
          const candidates = await prisma.user.findMany({
            where: { email: { equals: rawEmail, mode: 'insensitive' } },
            take: 2,
          })
          if (candidates.length === 1) user = candidates[0]
        }

        if (!user || !user.password) {
          registerLoginFailure(rlKey)
          return null
        }

        const isPasswordValid = await bcrypt.compare(password, user.password)

        if (!isPasswordValid) {
          registerLoginFailure(rlKey)
          return null
        }

        resetLoginAttempts(rlKey)
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: normalizeRole(user.role),
          memberId: user.memberId,
          mustChangePassword: user.mustChangePassword === true,
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = normalizeRole(user.role)
        token.id = user.id
        token.memberId = user.memberId ?? null
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword === true
      }

      // Refresca campos sensibles desde la DB cuando el cliente llama
      // a `update()` (p. ej. tras cambiar la contraseña).
      if (trigger === 'update' && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { mustChangePassword: true, role: true, memberId: true },
        })
        if (fresh) {
          token.mustChangePassword = fresh.mustChangePassword === true
          token.role = normalizeRole(fresh.role)
          token.memberId = fresh.memberId ?? null
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as {
          id?: string
          role?: string
          memberId?: string | null
          mustChangePassword?: boolean
        }
        u.role = normalizeRole(token.role)
        u.id = token.id as string
        u.memberId = (token.memberId as string | null | undefined) ?? null
        u.mustChangePassword = token.mustChangePassword === true
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
  }
}

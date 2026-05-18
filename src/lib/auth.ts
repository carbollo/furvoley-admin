import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { normalizeRole } from "@/lib/rbac"

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const rawEmail = String(credentials.email).trim()
        const normalizedEmail = rawEmail.toLowerCase()
        const password = String(credentials.password)

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
          return null
        }

        const isPasswordValid = await bcrypt.compare(password, user.password)

        if (!isPasswordValid) {
          return null
        }

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

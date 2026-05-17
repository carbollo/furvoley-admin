import NextAuth, { DefaultSession } from "next-auth"
import type { AppRole } from "@/lib/rbac"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: AppRole
      memberId?: string | null
      mustChangePassword?: boolean
    } & DefaultSession["user"]
  }

  interface User {
    role: AppRole
    memberId?: string | null
    mustChangePassword?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: AppRole
    memberId?: string | null
    mustChangePassword?: boolean
  }
}

import NextAuth, { DefaultSession } from "next-auth"
import type { AppRole } from "@/lib/rbac"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: AppRole
      memberId?: string | null
      mustChangePassword?: boolean
      /** Club (slug) al que pertenece la sesión. Se valida contra el tenant activo. */
      tenant?: string | null
      /** Sesión abierta por el proveedor del CRM con la identidad de un admin del club. */
      impersonated?: boolean
    } & DefaultSession["user"]
  }

  interface User {
    role: AppRole
    memberId?: string | null
    mustChangePassword?: boolean
    tenant?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: AppRole
    memberId?: string | null
    mustChangePassword?: boolean
    /** Club (slug) al que se emitió el token; se compara con el tenant activo. */
    tenant?: string | null
    impersonated?: boolean
  }
}

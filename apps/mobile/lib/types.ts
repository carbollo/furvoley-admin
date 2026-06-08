export type AppUser = {
  id: string
  email: string
  name: string | null
  role: string
  memberId: string | null
  mustChangePassword: boolean
}

export type TenantOption = {
  id: string
  name: string
  url: string
}

export type AuthSession = {
  accessToken: string
  tenantUrl: string
  user: AppUser
}

export type ClubBranding = {
  name: string
  logoUrl: string | null
  primaryColor: string | null
  subtitle?: string | null
}

import { prisma } from '@/lib/prisma'

export type ClubSettingsFull = {
  id: string
  name: string
  logoUrl: string | null
  primaryColor: string | null
  legalName: string | null
  taxId: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  province: string | null
  country: string | null
  contactEmail: string | null
  contactPhone: string | null
  website: string | null
  updatedAt: Date
}

export type ClubBranding = {
  name: string
  logoUrl: string | null
  primaryColor: string | null
  website: string | null
}

export type ClubIssuer = {
  /** Nombre comercial del club, p.ej. cabecera de factura */
  name: string
  /** Razón social legal */
  legalName: string | null
  /** CIF / NIF / VAT */
  taxId: string | null
  /** Dirección fiscal completa (multi-línea) */
  addressLines: string[]
  /** Email de contacto */
  contactEmail: string | null
  /** Teléfono de contacto */
  contactPhone: string | null
  /** Web pública */
  website: string | null
}

export type StripePortalConfig = {
  /** Stripe customer ID configurado vía Railway (`STRIPE_CLUB_CUSTOMER_ID`) */
  customerId: string
  /** Si el ADMIN puede pulsar "Abrir portal de cliente" */
  hasCustomerId: boolean
  /** URL del Dashboard de Stripe (`STRIPE_DASHBOARD_URL`) */
  dashboardUrl: string
  /** Customer ID enmascarado para mostrar en la UI */
  customerIdMasked: string
}

export type StripeConnectConfig = {
  /** Cuenta conectada del cliente (club) — `acct_…`. Lee `STRIPE_CONNECTED_ACCOUNT_ID`. */
  connectedAccountId: string
  /** Si los cobros se enrutan a una cuenta conectada (Direct Charges). */
  hasConnectedAccount: boolean
  /** Account ID enmascarado para mostrar en la UI. */
  connectedAccountIdMasked: string
  /**
   * Comisión que la plataforma se queda sobre cada cobro, en %. Lee
   * `STRIPE_APPLICATION_FEE_PERCENT`. 0 = sin comisión.
   */
  applicationFeePercent: number
}

/**
 * Devuelve los `ClubSettings` (singleton). Si no existen, los crea con valores
 * por defecto.
 */
export async function getClubSettings(): Promise<ClubSettingsFull> {
  const existing = await prisma.clubSettings.findUnique({ where: { isDefault: true } })
  if (existing) return existing
  return prisma.clubSettings.create({
    data: {
      isDefault: true,
      name: 'Furvoley',
      country: 'España',
    },
  })
}

/**
 * Devuelve solo los datos de branding necesarios para renderizar el header,
 * sidebar y portales públicos. Nunca lanza: si la BD falla devuelve fallback.
 */
export async function getClubBranding(): Promise<ClubBranding> {
  try {
    const s = await getClubSettings()
    return {
      name: s.name || 'Furvoley',
      logoUrl: s.logoUrl || null,
      primaryColor: s.primaryColor || null,
      website: s.website || null,
    }
  } catch {
    return { name: 'Furvoley', logoUrl: null, primaryColor: null, website: null }
  }
}

/**
 * Devuelve los datos del emisor para facturas, recibos y comunicaciones.
 */
export async function getClubIssuer(): Promise<ClubIssuer> {
  const s = await getClubSettings()
  const addressLines: string[] = []
  if (s.address) addressLines.push(s.address)
  const cityLine = [s.postalCode, s.city].filter(Boolean).join(' ')
  if (cityLine) addressLines.push(cityLine)
  const regionLine = [s.province, s.country].filter(Boolean).join(' · ')
  if (regionLine) addressLines.push(regionLine)
  return {
    name: s.name || 'Furvoley',
    legalName: s.legalName || null,
    taxId: s.taxId || null,
    addressLines,
    contactEmail: s.contactEmail || null,
    contactPhone: s.contactPhone || null,
    website: s.website || null,
  }
}

/**
 * Devuelve la configuración Stripe del club, leída exclusivamente de
 * variables de entorno (Railway). Mantener fuera de la BD evita que el
 * ADMIN pueda manipular el customer ID desde la UI.
 */
export function getStripePortalConfig(): StripePortalConfig {
  const rawCustomerId = (process.env.STRIPE_CLUB_CUSTOMER_ID || '').trim()
  const customerId = rawCustomerId.startsWith('cus_') ? rawCustomerId : ''
  const dashboardUrl =
    (process.env.STRIPE_DASHBOARD_URL || '').trim() || 'https://dashboard.stripe.com/'
  return {
    customerId,
    hasCustomerId: customerId !== '',
    dashboardUrl,
    customerIdMasked: customerId
      ? customerId.slice(0, 7) + '…' + customerId.slice(-4)
      : '',
  }
}

/**
 * Devuelve la configuración de Stripe Connect del cliente (club) que recibe
 * los cobros de sus socios. Lee exclusivamente env vars de Railway:
 * - `STRIPE_CONNECTED_ACCOUNT_ID` (`acct_…`): cuenta conectada destino.
 * - `STRIPE_APPLICATION_FEE_PERCENT` (0-100): comisión opcional de plataforma.
 */
export function getStripeConnectConfig(): StripeConnectConfig {
  const raw = (process.env.STRIPE_CONNECTED_ACCOUNT_ID || '').trim()
  const connectedAccountId = raw.startsWith('acct_') ? raw : ''
  const rawFee = (process.env.STRIPE_APPLICATION_FEE_PERCENT || '').trim()
  const parsedFee = rawFee ? Number(rawFee) : 0
  const applicationFeePercent =
    Number.isFinite(parsedFee) && parsedFee >= 0 && parsedFee <= 100 ? parsedFee : 0
  return {
    connectedAccountId,
    hasConnectedAccount: connectedAccountId !== '',
    connectedAccountIdMasked: connectedAccountId
      ? connectedAccountId.slice(0, 8) + '…' + connectedAccountId.slice(-4)
      : '',
    applicationFeePercent,
  }
}

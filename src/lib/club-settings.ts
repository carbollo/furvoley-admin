import { unstable_noStore as noStore } from 'next/cache'
import { prisma } from '@/lib/prisma'
import {
  getDefaultRegistrationFields,
  normalizeRegistrationFieldsConfig,
  type RegistrationFieldDef,
} from '@/lib/registration-fields'

export type InvoicePdfTemplateId = 'CLASSIC' | 'MODERN' | 'COMPACT'

export const INVOICE_PDF_TEMPLATES: readonly InvoicePdfTemplateId[] = [
  'CLASSIC',
  'MODERN',
  'COMPACT',
]

export function normalizeInvoicePdfTemplate(
  raw: string | null | undefined,
): InvoicePdfTemplateId {
  const v = String(raw || 'CLASSIC').trim().toUpperCase()
  if (v === 'MODERN' || v === 'COMPACT') return v
  return 'CLASSIC'
}

export type ClubSettingsFull = {
  id: string
  name: string
  logoUrl: string | null
  primaryColor: string | null
  invoicePdfTemplate: string
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
  registrationFieldsConfig: unknown
  updatedAt: Date
}

export type ClubBranding = {
  name: string
  logoUrl: string | null
  primaryColor: string | null
  website: string | null
  /** Razón social o línea secundaria bajo el nombre en el panel de socios */
  subtitle: string | null
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

/**
 * Devuelve los `ClubSettings` (singleton). Si no existen, los crea con valores
 * por defecto.
 */
export async function getClubSettings(): Promise<ClubSettingsFull> {
  noStore()
  const existing =
    (await prisma.clubSettings.findFirst({ where: { isDefault: true } })) ??
    (await prisma.clubSettings.findFirst({ orderBy: { updatedAt: 'desc' } }))
  if (existing) return existing
  return prisma.clubSettings.create({
    data: {
      isDefault: true,
      name: 'ProClubCRM',
      country: 'España',
    },
  })
}

/**
 * Devuelve solo los datos de branding necesarios para renderizar el header,
 * sidebar y portales públicos. Nunca lanza: si la BD falla devuelve fallback.
 */
export async function getClubBranding(): Promise<ClubBranding> {
  noStore()
  try {
    const s = await getClubSettings()
    return {
      name: s.name || 'ProClubCRM',
      logoUrl: s.logoUrl || null,
      primaryColor: s.primaryColor || null,
      website: s.website || null,
      subtitle: s.legalName?.trim() || null,
    }
  } catch {
    return { name: 'ProClubCRM', logoUrl: null, primaryColor: null, website: null, subtitle: null }
  }
}

/**
 * Construye el bloque emisor a partir de `ClubSettings` (sin consulta extra a BD).
 */
export function clubSettingsToIssuer(s: ClubSettingsFull): ClubIssuer {
  const addressLines: string[] = []
  if (s.address) addressLines.push(s.address)
  const cityLine = [s.postalCode, s.city].filter(Boolean).join(' ')
  if (cityLine) addressLines.push(cityLine)
  const regionLine = [s.province, s.country].filter(Boolean).join(' · ')
  if (regionLine) addressLines.push(regionLine)
  return {
    name: s.name || 'ProClubCRM',
    legalName: s.legalName || null,
    taxId: s.taxId || null,
    addressLines,
    contactEmail: s.contactEmail || null,
    contactPhone: s.contactPhone || null,
    website: s.website || null,
  }
}

/**
 * Devuelve los datos del emisor para facturas, recibos y comunicaciones.
 */
export async function getClubIssuer(): Promise<ClubIssuer> {
  const s = await getClubSettings()
  return clubSettingsToIssuer(s)
}

/** Campos de inscripción normalizados (enlace público + alta CRM). */
export async function getRegistrationFieldsConfig(): Promise<RegistrationFieldDef[]> {
  const s = await getClubSettings()
  return normalizeRegistrationFieldsConfig(s.registrationFieldsConfig)
}

export function registrationFieldsFromSettings(
  settings: Pick<ClubSettingsFull, 'registrationFieldsConfig'>,
): RegistrationFieldDef[] {
  return normalizeRegistrationFieldsConfig(settings.registrationFieldsConfig)
}

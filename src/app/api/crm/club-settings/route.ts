import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import {
  getClubSettings,
  normalizeInvoicePdfTemplate,
  registrationFieldsFromSettings,
} from '@/lib/club-settings'
import {
  normalizeRegistrationFieldsConfig,
  validateRegistrationFieldsConfig,
} from '@/lib/registration-fields'
import { getWhopClubConfig } from '@/lib/whop/club-config'
import { whopSignupUrl, whopApiKeysUrl } from '@/lib/whop/connect'

const MAX_LOGO_SIZE_BYTES = 768 * 1024 // ~768 KB para data URLs base64 (~ 1 MB en raw)

async function serialize(s: Awaited<ReturnType<typeof getClubSettings>>) {
  return {
    id: s.id,
    name: s.name,
    logoUrl: s.logoUrl ?? null,
    legalName: s.legalName ?? '',
    taxId: s.taxId ?? '',
    address: s.address ?? '',
    city: s.city ?? '',
    postalCode: s.postalCode ?? '',
    province: s.province ?? '',
    country: s.country ?? '',
    contactEmail: s.contactEmail ?? '',
    contactPhone: s.contactPhone ?? '',
    website: s.website ?? '',
    primaryColor: s.primaryColor ?? '',
    invoicePdfTemplate: normalizeInvoicePdfTemplate(s.invoicePdfTemplate),
    registrationFieldsConfig: registrationFieldsFromSettings(s),
    updatedAt: s.updatedAt.toISOString(),
    whop: await serializeWhop(),
  }
}

/**
 * Bloque de la pasarela para el navegador. Se enumeran los campos UNO A UNO a
 * propósito: con un spread, cualquier campo que se añada luego a la config
 * (identificadores crudos, tokens del banco…) acabaría publicado sin querer.
 */
async function serializeWhop() {
  const w = await getWhopClubConfig()
  return {
    hasCompany: w.hasCompany,
    companyIdMasked: w.companyIdMasked,
    onboardingStatus: w.onboardingStatus,
    chargesEnabled: w.chargesEnabled,
    payoutsEnabled: w.payoutsEnabled,
    hasPayoutMethod: w.hasPayoutMethod,
    canCharge: w.canCharge,
    statusAt: w.statusAt,
    signupUrl: whopSignupUrl(),
    apiKeysUrl: whopApiKeysUrl(),
  }
}

export async function GET(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response
  const s = await getClubSettings()
  return NextResponse.json({ settings: await serialize(s) })
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  const strFields = [
    'name', 'legalName', 'taxId', 'address', 'city', 'postalCode', 'province',
    'country', 'contactEmail', 'contactPhone', 'website', 'primaryColor',
  ] as const

  for (const k of strFields) {
    if (k in body) {
      const v = body[k]
      if (v === null) {
        data[k] = null
      } else if (typeof v === 'string') {
        const trimmed = v.trim()
        if (k === 'name' && trimmed === '') {
          return NextResponse.json({ error: 'El nombre del club no puede estar vacío' }, { status: 400 })
        }
        data[k] = trimmed === '' ? null : trimmed
      }
    }
  }

  // Si se intenta dejar name a null, ponemos un valor por defecto
  if (data.name === null) data.name = 'ProClubCRM'

  if (typeof data.contactEmail === 'string' && data.contactEmail && !data.contactEmail.includes('@')) {
    return NextResponse.json({ error: 'El email de contacto no es válido' }, { status: 400 })
  }
  if (typeof data.website === 'string' && data.website && !/^https?:\/\//i.test(data.website)) {
    data.website = 'https://' + data.website
  }

  if ('invoicePdfTemplate' in body) {
    const raw = body.invoicePdfTemplate
    if (typeof raw !== 'string') {
      return NextResponse.json({ error: 'Plantilla PDF inválida' }, { status: 400 })
    }
    data.invoicePdfTemplate = normalizeInvoicePdfTemplate(raw)
  }

  if ('registrationFieldsConfig' in body) {
    const raw = body.registrationFieldsConfig
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'Configuración de campos de registro inválida' }, { status: 400 })
    }
    const normalized = normalizeRegistrationFieldsConfig(raw)
    const configError = validateRegistrationFieldsConfig(normalized)
    if (configError) {
      return NextResponse.json({ error: configError }, { status: 400 })
    }
    data.registrationFieldsConfig = normalized
  }

  // Logo (data URL o URL https)
  if ('logoUrl' in body) {
    const raw = body.logoUrl
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      data.logoUrl = null
    } else if (typeof raw === 'string') {
      const isDataUrl = raw.startsWith('data:image/')
      const isHttpUrl = /^https?:\/\//i.test(raw)
      if (!isDataUrl && !isHttpUrl) {
        return NextResponse.json({ error: 'El escudo debe ser una imagen válida o una URL https' }, { status: 400 })
      }
      if (isDataUrl && raw.length > MAX_LOGO_SIZE_BYTES) {
        return NextResponse.json({ error: 'El escudo es demasiado grande. Máximo ~512KB.' }, { status: 413 })
      }
      data.logoUrl = raw
    }
  }

  await prisma.clubSettings.upsert({
    where: { isDefault: true },
    update: data,
    create: {
      isDefault: true,
      name: typeof data.name === 'string' ? data.name : 'ProClubCRM',
      ...data,
    },
  })

  const fresh = await getClubSettings()
  revalidatePath('/', 'layout')
  revalidatePath('/')
  revalidatePath('/calendar')
  revalidatePath('/my-billing')
  revalidatePath('/mural')
  return NextResponse.json({ ok: true, settings: await serialize(fresh) })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

const MAX_LOGO_SIZE_BYTES = 768 * 1024 // ~768 KB para data URLs base64 (~ 1 MB en raw)

async function getOrCreateSettings() {
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

function serialize(s: Awaited<ReturnType<typeof getOrCreateSettings>>) {
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
    stripeCustomerId: s.stripeCustomerId ?? '',
    stripeDashboardUrl: s.stripeDashboardUrl ?? '',
    updatedAt: s.updatedAt.toISOString(),
  }
}

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response
  const s = await getOrCreateSettings()
  return NextResponse.json({ settings: serialize(s) })
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Sanitización
  const data: Record<string, unknown> = {}
  const strFields = [
    'name', 'legalName', 'taxId', 'address', 'city', 'postalCode', 'province',
    'country', 'contactEmail', 'contactPhone', 'website', 'primaryColor',
    'stripeCustomerId', 'stripeDashboardUrl',
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
  if (data.name === null) data.name = 'Furvoley'

  // Validaciones suaves
  if (typeof data.contactEmail === 'string' && data.contactEmail && !data.contactEmail.includes('@')) {
    return NextResponse.json({ error: 'El email de contacto no es válido' }, { status: 400 })
  }
  if (typeof data.website === 'string' && data.website && !/^https?:\/\//i.test(data.website)) {
    data.website = 'https://' + data.website
  }
  if (typeof data.stripeDashboardUrl === 'string' && data.stripeDashboardUrl && !/^https?:\/\//i.test(data.stripeDashboardUrl)) {
    data.stripeDashboardUrl = 'https://' + data.stripeDashboardUrl
  }

  // Logo (data URL)
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
      name: typeof data.name === 'string' ? data.name : 'Furvoley',
      ...data,
    },
  })

  const fresh = await getOrCreateSettings()
  return NextResponse.json({ ok: true, settings: serialize(fresh) })
}

import { NextResponse } from 'next/server'
import { createMember } from '@/app/actions'
import { requireRoles } from '@/lib/rbac-api'

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  let body: {
    firstName?: string
    lastName?: string
    name?: string
    dni?: string
    email?: string
    address?: string
    sportPreference?: string
    birthDate?: string
    joinedAt?: string
    phone?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const first = String(body.firstName || '').trim()
  const last = String(body.lastName || '').trim()
  const fullNameDirect = String(body.name || '').trim()

  const combined =
    fullNameDirect ||
    ([first, last].filter(Boolean).join(' ').trim() || '')
  const phone = String(body.phone || '').trim()

  if (!combined) {
    return NextResponse.json(
      { error: 'Nombre y apellidos (o nombre completo) son obligatorios' },
      { status: 400 },
    )
  }
  if (!phone) {
    return NextResponse.json({ error: 'El teléfono es obligatorio' }, { status: 400 })
  }
  const birthDateRaw = String(body.birthDate || '').trim()
  if (!birthDateRaw) {
    return NextResponse.json({ error: 'La fecha de nacimiento es obligatoria' }, { status: 400 })
  }
  const birthDate = new Date(birthDateRaw)
  if (Number.isNaN(birthDate.getTime())) {
    return NextResponse.json({ error: 'Fecha de nacimiento inválida' }, { status: 400 })
  }

  let joined: Date | undefined
  if (body.joinedAt) {
    const d = new Date(body.joinedAt)
    if (!Number.isNaN(d.getTime())) joined = d
  }

  const member = await createMember({
    name: combined,
    email: body.email?.trim() || undefined,
    phone,
    dni: body.dni?.trim() || undefined,
    address: body.address?.trim() || undefined,
    sportPreference: body.sportPreference?.trim() || undefined,
    birthDate,
    status: 'ACTIVE',
    ...(joined !== undefined ? { joinedAt: joined } : {}),
  })
  const hasEmail = !!member.email?.trim()
  const defaultPasswordRaw = process.env.MEMBER_DEFAULT_PASSWORD || '12345678'
  return NextResponse.json({
    ok: true,
    id: member.id,
    memberAccount: hasEmail
      ? {
          email: member.email,
          role: 'MEMBER',
          defaultPassword: defaultPasswordRaw,
        }
      : null,
    warning: hasEmail ? null : 'El socio no tiene email válido; no se creó usuario de portal.',
  })
}

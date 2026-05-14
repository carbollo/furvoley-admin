import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createMember } from '@/app/actions'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    firstName?: string
    lastName?: string
    name?: string
    dni?: string
    email?: string
    address?: string
    sportPreference?: string
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
    status: 'ACTIVE',
    ...(joined !== undefined ? { joinedAt: joined } : {}),
  })

  return NextResponse.json({ ok: true, id: member.id })
}

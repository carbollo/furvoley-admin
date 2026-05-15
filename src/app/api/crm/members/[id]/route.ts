import { NextResponse } from 'next/server'
import { deleteMember, updateMember } from '@/app/actions'
import { requireRoles } from '@/lib/rbac-api'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  let body: {
    name?: string
    email?: string
    phone?: string
    dni?: string
    address?: string
    sportPreference?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const payload: {
    name?: string
    email?: string
    phone?: string
    dni?: string
    address?: string
    sportPreference?: string | null
  } = {}
  if (typeof body.name === 'string' && body.name.trim()) payload.name = body.name.trim()
  if (body.email !== undefined)
    payload.email = body.email.trim() ? body.email.trim() : undefined
  if (body.phone !== undefined)
    payload.phone = body.phone.trim() ? body.phone.trim() : undefined
  if (body.dni !== undefined)
    payload.dni = body.dni.trim() ? body.dni.trim() : undefined
  if (body.address !== undefined)
    payload.address = body.address.trim() ? body.address.trim() : undefined
  if (body.sportPreference !== undefined)
    payload.sportPreference = body.sportPreference.trim()
      ? body.sportPreference.trim()
      : null

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'Sin datos para actualizar' }, { status: 400 })
  }

  await updateMember(id, payload)

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await context.params
  try {
    await deleteMember(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[crm/members DELETE] failed', { id, error: e })
    return NextResponse.json({ error: e?.message || 'No se pudo eliminar el socio' }, { status: 400 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const action = String(url.searchParams.get('action') || '').trim()
  if (action !== 'reset-portal-access') {
    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 })
  }

  const { id } = await context.params
  const member = await prisma.member.findUnique({
    where: { id },
    select: { id: true, email: true, name: true },
  })
  if (!member) {
    return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })
  }
  const email = member.email?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'El socio no tiene email. No se puede crear acceso.' }, { status: 400 })
  }
  const defaultPassword = process.env.MEMBER_DEFAULT_PASSWORD || '12345678'
  const password = await bcrypt.hash(defaultPassword, 10)

  await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } })
    if (!existing) {
      await tx.user.create({
        data: {
          name: member.name,
          email,
          role: 'MEMBER',
          memberId: member.id,
          password,
        },
      })
      return
    }

    if (existing.role !== 'MEMBER' && existing.memberId !== member.id) {
      throw new Error('Ese email ya está asignado a una cuenta no MEMBER.')
    }
    await tx.user.update({
      where: { id: existing.id },
      data: {
        role: 'MEMBER',
        memberId: member.id,
        password,
      },
    })
  })

  return NextResponse.json({
    ok: true,
    access: { email, defaultPassword },
  })
}

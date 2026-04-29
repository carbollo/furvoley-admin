import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateMember } from '@/app/actions'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

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

  let body: { name?: string; email?: string; phone?: string; dni?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }

  const member = await createMember({
    name,
    email: body.email?.trim() || undefined,
    phone: body.phone?.trim() || undefined,
    dni: body.dni?.trim() || undefined,
    status: 'ACTIVE',
  })

  return NextResponse.json({ ok: true, id: member.id })
}

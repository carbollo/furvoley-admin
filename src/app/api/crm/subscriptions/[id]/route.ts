import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { revalidatePath } from 'next/cache'

type Params = { params: Promise<{ id: string }> }

const ALLOWED = ['ACTIVE', 'PAUSED', 'CANCELED'] as const

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  let body: { status?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const status = String(body.status || '').toUpperCase()
  if (!ALLOWED.includes(status as (typeof ALLOWED)[number])) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const existing = await prisma.subscription.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
  }

  await prisma.subscription.update({
    where: { id },
    data: {
      status,
      endDate: status === 'CANCELED' ? new Date() : existing.endDate,
    },
  })

  revalidatePath('/')
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const period = await prisma.fiscalPeriod.findUnique({ where: { id } })
  if (!period) return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 })
  const isClosed = Boolean(body.isClosed)
  const updated = await prisma.fiscalPeriod.update({
    where: { id },
    data: { isClosed },
  })
  return NextResponse.json({ ok: true, period: updated })
}

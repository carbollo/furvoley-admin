import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response
  const { id } = await context.params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const period = await prisma.fiscalPeriod.findUnique({ where: { id: parsedId } })
  if (!period) return NextResponse.json({ error: 'Periodo no encontrado' }, { status: 404 })
  const isClosed = Boolean(body.isClosed)
  const updated = await prisma.fiscalPeriod.update({
    where: { id: parsedId },
    data: { isClosed },
  })
  return NextResponse.json({ ok: true, period: updated })
}

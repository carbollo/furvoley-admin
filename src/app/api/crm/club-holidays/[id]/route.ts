import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'COACH'])
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId
  const deleted = await prisma.clubHoliday.deleteMany({ where: { id: parsedId } })
  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Festivo no encontrado' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'

export const dynamic = 'force-dynamic'

/** Activar/desactivar un código (no se borra: las suscripciones lo referencian). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const parsedId = parseCuid(id, 'discountId')
  if (parsedId instanceof Response) return parsedId

  let body: { isActive?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (body.isActive === undefined) {
    return NextResponse.json({ error: 'Sin datos para actualizar' }, { status: 400 })
  }

  try {
    await prisma.discountCode.update({
      where: { id: parsedId },
      data: { isActive: body.isActive === true },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Descuento no encontrado' }, { status: 404 })
  }
}

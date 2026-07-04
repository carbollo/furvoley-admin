import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseCuid } from '@/lib/db-input-validation'
import { requireRoles } from '@/lib/rbac-api'
import { revalidatePath } from 'next/cache'

type Params = { params: Promise<{ id: string }> }

const ALLOWED = ['ACTIVE', 'PAUSED', 'CANCELED'] as const

/**
 * Modificar una suscripción (roadmap · 6.3): estado (pausar/cancelar/reactivar),
 * cambio de plan (el nuevo importe/periodicidad aplican desde la siguiente
 * factura) y fecha del próximo cobro.
 */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireRoles(['ADMIN', 'TREASURER'], request)
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId

  let body: { status?: string; planId?: string; nextInvoiceDate?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const existing = await prisma.subscription.findUnique({ where: { id: parsedId } })
  if (!existing) {
    return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
  }

  const data: { status?: string; endDate?: Date | null; planId?: string; nextInvoiceDate?: Date } = {}

  if (body.status !== undefined) {
    const status = String(body.status || '').toUpperCase()
    if (!ALLOWED.includes(status as (typeof ALLOWED)[number])) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    }
    data.status = status
    data.endDate = status === 'CANCELED' ? new Date() : existing.endDate
  }

  if (body.planId !== undefined) {
    const parsedPlanId = parseCuid(String(body.planId), 'planId')
    if (parsedPlanId instanceof Response) return parsedPlanId
    const plan = await prisma.membershipPlan.findUnique({ where: { id: parsedPlanId } })
    if (!plan || !plan.isActive) {
      return NextResponse.json({ error: 'Plan no encontrado o inactivo' }, { status: 404 })
    }
    data.planId = parsedPlanId
  }

  if (body.nextInvoiceDate !== undefined) {
    const d = new Date(String(body.nextInvoiceDate))
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Fecha de próxima factura no válida' }, { status: 400 })
    }
    data.nextInvoiceDate = d
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Sin datos para actualizar' }, { status: 400 })
  }

  await prisma.subscription.update({ where: { id: parsedId }, data })

  revalidatePath('/')
  return NextResponse.json({ ok: true })
}

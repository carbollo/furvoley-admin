import { NextResponse } from 'next/server'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { createInvoiceCheckoutUrl } from '@/lib/payments/invoice-checkout'
import { normalizeRole } from '@/lib/rbac'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await enterTenantFromRequest(req)
  const session = await getSessionFromRequest(req)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId
  const role = normalizeRole((session.user as { role?: string }).role)
  const userMemberId = (session.user as { memberId?: string | null }).memberId ?? null

  const invoice = await prisma.invoice.findUnique({
    where: { id: parsedId },
    select: { id: true, memberId: true },
  })
  if (!invoice) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
  }

  const isStaff = role === 'ADMIN' || role === 'TREASURER'
  const isOwner = userMemberId != null && userMemberId === invoice.memberId
  if (!isStaff && !isOwner) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const result = await createInvoiceCheckoutUrl(parsedId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ url: result.url })
}

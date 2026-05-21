import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { createInvoiceCheckoutUrl } from '@/lib/stripe-checkout'
import { normalizeRole } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
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

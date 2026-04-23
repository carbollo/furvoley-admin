import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildInvoicePdf } from '@/lib/invoice-pdf'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new Response('No autorizado', { status: 401 })
  }

  const role = (session.user as { role?: string }).role
  const userMemberId = (session.user as { memberId?: string | null }).memberId

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      member: true,
      items: true,
    },
  })

  if (!invoice) {
    return new Response('Factura no encontrada', { status: 404 })
  }

  const isAdmin = role === 'ADMIN'
  const isOwner = userMemberId != null && userMemberId === invoice.memberId
  if (!isAdmin && !isOwner) {
    return new Response('No autorizado', { status: 403 })
  }

  const bytes = await buildInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    kind: invoice.kind,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    currency: invoice.currency,
    member: {
      name: invoice.member.name,
      email: invoice.member.email,
      address: invoice.member.address,
      dni: invoice.member.dni,
    },
    items: invoice.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitAmount: i.unitAmount,
      totalAmount: i.totalAmount,
    })),
  })

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { pdfStoredAt: new Date() },
  })

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    },
  })
}

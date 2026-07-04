import { getServerSession } from 'next-auth'
import { enterTenantFromRequest } from '@/lib/multitenant/request'
import { authOptions } from '@/lib/auth'
import { parseCuid } from '@/lib/db-input-validation'
import { prisma } from '@/lib/prisma'
import { buildInvoicePdf } from '@/lib/invoice-pdf'
import { clubSettingsToIssuer, getClubSettings, normalizeInvoicePdfTemplate } from '@/lib/club-settings'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await enterTenantFromRequest(_req)
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new Response('No autorizado', { status: 401 })
  }

  const role = (session.user as { role?: string }).role
  const userMemberId = (session.user as { memberId?: string | null }).memberId

  const { id } = await params
  const parsedId = parseCuid(id, 'id')
  if (parsedId instanceof Response) return parsedId
  const invoice = await prisma.invoice.findUnique({
    where: { id: parsedId },
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

  const club = await getClubSettings()
  const issuer = clubSettingsToIssuer(club)
  const template = normalizeInvoicePdfTemplate(club.invoicePdfTemplate)

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
    issuer: {
      name: issuer.name,
      legalName: issuer.legalName,
      taxId: issuer.taxId,
      addressLines: issuer.addressLines,
      contactEmail: issuer.contactEmail,
      contactPhone: issuer.contactPhone,
      website: issuer.website,
    },
    primaryColor: club.primaryColor ?? null,
    template,
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

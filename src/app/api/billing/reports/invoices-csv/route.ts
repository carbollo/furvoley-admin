import { prisma } from '@/lib/prisma'

function toCsvRow(fields: Array<string | number>) {
  return fields
    .map((f) => `"${String(f).replaceAll('"', '""')}"`)
    .join(',')
}

export async function GET() {
  const invoices = await prisma.invoice.findMany({
    include: { member: true },
    orderBy: { issueDate: 'desc' },
  })

  const lines = [
    toCsvRow([
      'invoiceNumber',
      'member',
      'issueDate',
      'dueDate',
      'status',
      'totalAmount',
      'paidAmount',
      'pendingAmount',
    ]),
    ...invoices.map((i) =>
      toCsvRow([
        i.invoiceNumber,
        i.member.name,
        i.issueDate.toISOString(),
        i.dueDate.toISOString(),
        i.status,
        i.totalAmount,
        i.paidAmount,
        Math.max(0, i.totalAmount - i.paidAmount),
      ]),
    ),
  ]

  const csv = lines.join('\n')
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="furvoley-invoices.csv"',
    },
  })
}


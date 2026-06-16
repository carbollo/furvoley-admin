import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

function toCsvRow(fields: Array<string | number>) {
  // Prefijo anti CSV-injection: si el campo empieza por =,+,-,@ o tab, se
  // antepone un apóstrofo para que Excel/Sheets no lo interprete como fórmula.
  return fields
    .map((f) => {
      let s = String(f)
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
      return `"${s.replaceAll('"', '""')}"`
    })
    .join(',')
}

export async function GET() {
  const auth = await requireRoles(['ADMIN', 'TREASURER'])
  if (!auth.ok) return auth.response

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


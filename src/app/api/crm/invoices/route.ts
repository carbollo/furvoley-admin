import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function nextInvoiceNumber() {
  const year = new Date().getFullYear()
  const prefix = `FV-${year}-`
  const count = await prisma.invoice.count({
    where: { invoiceNumber: { startsWith: prefix } },
  })
  return `${prefix}${String(count + 1).padStart(5, '0')}`
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user || role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const memberId = String(body.memberId || '').trim()
  const concepto = String(body.concepto || '').trim()
  const amount = Number(body.amount)
  const dueDateRaw = String(body.dueDate || '').trim()

  if (!memberId || !concepto || !Number.isFinite(amount) || amount <= 0 || !dueDateRaw) {
    return NextResponse.json({ error: 'Datos incompletos o inválidos' }, { status: 400 })
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true },
  })
  if (!member) {
    return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })
  }

  const dueDate = new Date(dueDateRaw)
  if (Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: 'Fecha de vencimiento inválida' }, { status: 400 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const status = dueDate < today ? 'OVERDUE' : 'PENDING'

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: await nextInvoiceNumber(),
      kind: 'OTHER',
      issueDate: new Date(),
      dueDate,
      subtotal: amount,
      taxAmount: 0,
      totalAmount: amount,
      paidAmount: 0,
      currency: 'EUR',
      status,
      memberId,
      items: {
        create: [
          {
            description: concepto,
            quantity: 1,
            unitAmount: amount,
            totalAmount: amount,
          },
        ],
      },
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: invoice.id })
}

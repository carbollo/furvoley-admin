'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import {
  runMemberCreatedWorkflows,
  runMemberStatusChangedWorkflows,
  runMemberUpdatedWorkflows,
  runPaymentCreatedWorkflows,
  runPaymentPaidWorkflows,
} from '@/lib/workflow-engine'

// MEMBERS
export async function createMember(data: {
  name: string
  dni?: string
  birthDate?: Date | null
  email?: string
  phone?: string
  address?: string
  sportPreference?: string
  joinedAt?: Date
  status?: string
}) {
  const { joinedAt, ...rest } = data
  const defaultPasswordRaw = process.env.MEMBER_DEFAULT_PASSWORD || '12345678'
  const hashedDefaultPassword = await bcrypt.hash(defaultPasswordRaw, 10)
  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        ...rest,
        ...(joinedAt !== undefined ? { joinedAt } : {}),
      },
    })

    const email = created.email?.trim().toLowerCase()
    if (email) {
      const existing = await tx.user.findUnique({ where: { email } })
      if (!existing) {
        await tx.user.create({
          data: {
            name: created.name,
            email,
            password: hashedDefaultPassword,
            role: 'MEMBER',
            memberId: created.id,
          },
        })
      } else if (existing.role === 'MEMBER' && (!existing.memberId || existing.memberId === created.id)) {
        await tx.user.update({
          where: { id: existing.id },
          data: {
            role: 'MEMBER',
            memberId: created.id,
            password: hashedDefaultPassword,
          },
        })
      } else {
        throw new Error('El email ya está en uso por otra cuenta. Usa otro email para el socio.')
      }
    }
    return created
  })
  await runMemberCreatedWorkflows(member.id)
  revalidatePath('/')
  return member
}

export async function updateMember(
  id: string,
  data: {
    name?: string
    dni?: string
    birthDate?: Date | null
    email?: string
    phone?: string
    address?: string
    sportPreference?: string | null
    status?: string
  },
) {
  const before = await prisma.member.findUnique({
    where: { id },
    select: { status: true },
  })
  const member = await prisma.member.update({ where: { id }, data })
  await runMemberUpdatedWorkflows(member.id)
  if (before?.status != null && before.status !== member.status) {
    await runMemberStatusChangedWorkflows(member.id, {
      previousStatus: before.status,
      currentStatus: member.status,
    })
  }
  revalidatePath('/')
  return member
}

export async function deleteMember(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({
      where: {
        memberId: id,
        role: { in: ['MEMBER', 'PLAYER'] },
      },
    })
    await tx.user.updateMany({
      where: { memberId: id },
      data: { memberId: null },
    })

    await tx.signupLink.updateMany({
      where: { createdMemberId: id },
      data: { createdMemberId: null },
    })
    await tx.order.updateMany({
      where: { memberId: id },
      data: { memberId: null },
    })

    await tx.teamMember.deleteMany({ where: { memberId: id } })
    await tx.attendance.deleteMany({ where: { memberId: id } })
    await tx.payment.deleteMany({ where: { memberId: id } })
    await tx.reminderLog.deleteMany({ where: { memberId: id } })
    await tx.subscription.deleteMany({ where: { memberId: id } })
    await tx.invoice.deleteMany({ where: { memberId: id } })

    await tx.member.delete({ where: { id } })
  })
  revalidatePath('/')
}

export async function sendWhatsAppPaymentReminders() {
  const apiUrl = process.env.APIWASS_API_URL || 'https://api.wassenger.com/v1/messages'
  const apiToken = process.env.APIWASS_TOKEN

  if (!apiToken) {
    throw new Error('Falta APIWASS_TOKEN en variables de entorno')
  }

  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { status: 'OVERDUE' },
        {
          status: 'PARTIAL',
          dueDate: { lt: new Date() },
        },
      ],
    },
    include: { member: true },
  })

  // Agrupar deuda por socio
  const byMember = new Map<
    string,
    {
      memberId: string
      memberName: string
      phone: string | null
      pendingTotal: number
      oldestDueDate: Date
    }
  >()

  for (const invoice of overdueInvoices) {
    const pending = Math.max(0, invoice.totalAmount - invoice.paidAmount)
    if (pending <= 0) continue

    const existing = byMember.get(invoice.memberId)
    if (!existing) {
      byMember.set(invoice.memberId, {
        memberId: invoice.memberId,
        memberName: invoice.member.name,
        phone: invoice.member.phone || null,
        pendingTotal: pending,
        oldestDueDate: invoice.dueDate,
      })
      continue
    }

    existing.pendingTotal += pending
    if (invoice.dueDate < existing.oldestDueDate) {
      existing.oldestDueDate = invoice.dueDate
    }
  }

  let sent = 0
  let failed = 0
  let skippedNoPhone = 0

  for (const member of byMember.values()) {
    if (!member.phone) {
      skippedNoPhone++
      continue
    }

    const message =
      `Hola ${member.memberName}, te recordamos que tienes cuotas pendientes en Furvoley.\n` +
      `Importe pendiente: ${member.pendingTotal.toFixed(2)} EUR.\n` +
      `Vencimiento más antiguo: ${member.oldestDueDate.toLocaleDateString('es-ES')}.\n` +
      `Por favor, regulariza el pago lo antes posible. Gracias.`

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Token: apiToken,
        },
        body: JSON.stringify({
          phone: member.phone,
          message,
        }),
      })

      if (!response.ok) {
        failed++
        continue
      }
      sent++
    } catch {
      failed++
    }
  }

  revalidatePath('/')
  return { sent, failed, skippedNoPhone, totalMembersInDebt: byMember.size }
}

// PAYMENTS
export async function createPayment(data: { memberId: string; amount: number; month: number; year: number; status?: string }) {
  const payment = await prisma.payment.create({ data })
  await runPaymentCreatedWorkflows(payment.id)
  if (payment.status === 'PAID') {
    await runPaymentPaidWorkflows(payment.id)
  }
  revalidatePath('/')
  return payment
}

export async function generateStripeLink(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { member: true }
  })

  if (!payment) throw new Error("Payment not found")
  if (payment.stripeUrl) return payment.stripeUrl

  const { getStripe } = await import('@/lib/stripe')
  const stripe = getStripe()
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Mensualidad Voleibol - ${payment.month}/${payment.year}`,
            description: `Socio: ${payment.member.name}`,
          },
          unit_amount: Math.round(payment.amount * 100), // Stripe expects cents
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${appUrl}/?tab=contabilidad&stripeSuccess=1`,
    cancel_url: `${appUrl}/?tab=contabilidad&stripeCanceled=1`,
    client_reference_id: payment.id,
  })

  const updatedPayment = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      stripeUrl: session.url,
      stripeSessionId: session.id
    }
  })

  revalidatePath('/')
  return session.url
}

export async function updatePaymentStatus(id: string, status: string) {
  const before = await prisma.payment.findUnique({
    where: { id },
    select: { status: true },
  })
  await prisma.payment.update({
    where: { id },
    data: { 
      status,
      paidAt: status === 'PAID' ? new Date() : null
    }
  })
  if (before?.status !== 'PAID' && status === 'PAID') {
    await runPaymentPaidWorkflows(id)
  }
  revalidatePath('/')
}

// TRANSACTIONS
export async function createTransaction(data: {
  type: string
  amount: number
  description: string
  date?: Date
  bankReference?: string | null
  source?: string
}) {
  const transaction = await prisma.transaction.create({
    data: {
      type: data.type,
      amount: data.amount,
      description: data.description,
      date: data.date ?? new Date(),
      bankReference: data.bankReference ?? null,
      source: data.source ?? 'MANUAL',
    },
  })
  revalidatePath('/accounting')
  return transaction
}

export async function deleteTransaction(id: string) {
  await prisma.transaction.delete({ where: { id } })
  revalidatePath('/accounting')
}

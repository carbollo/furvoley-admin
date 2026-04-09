'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

// MEMBERS
export async function createMember(data: { name: string; email?: string; phone?: string; status?: string }) {
  const member = await prisma.member.create({ data })
  revalidatePath('/members')
  return member
}

export async function updateMember(id: string, data: { name?: string; email?: string; phone?: string; status?: string }) {
  const member = await prisma.member.update({ where: { id }, data })
  revalidatePath('/members')
  return member
}

export async function deleteMember(id: string) {
  await prisma.member.delete({ where: { id } })
  revalidatePath('/members')
}

// PAYMENTS
export async function createPayment(data: { memberId: string; amount: number; month: number; year: number; status?: string }) {
  const payment = await prisma.payment.create({ data })
  revalidatePath('/payments')
  return payment
}

export async function generateStripeLink(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { member: true }
  })

  if (!payment) throw new Error("Payment not found")
  if (payment.stripeUrl) return payment.stripeUrl

  const { stripe } = await import('@/lib/stripe')
  
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
    success_url: `${appUrl}/payments?success=true`,
    cancel_url: `${appUrl}/payments?canceled=true`,
    client_reference_id: payment.id,
  })

  const updatedPayment = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      stripeUrl: session.url,
      stripeSessionId: session.id
    }
  })

  revalidatePath('/payments')
  return session.url
}

export async function updatePaymentStatus(id: string, status: string) {
  await prisma.payment.update({
    where: { id },
    data: { 
      status,
      paidAt: status === 'PAID' ? new Date() : null
    }
  })
  revalidatePath('/payments')
}

// TRANSACTIONS
export async function createTransaction(data: { type: string; amount: number; description: string; date?: Date }) {
  const transaction = await prisma.transaction.create({ data })
  revalidatePath('/accounting')
  return transaction
}

export async function deleteTransaction(id: string) {
  await prisma.transaction.delete({ where: { id } })
  revalidatePath('/accounting')
}

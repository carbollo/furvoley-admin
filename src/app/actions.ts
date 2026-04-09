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

export async function updatePaymentStatus(id: string, status: string) {
  const payment = await prisma.payment.update({
    where: { id },
    data: { 
      status,
      paidAt: status === 'PAID' ? new Date() : null
    }
  })
  revalidatePath('/payments')
  return payment
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

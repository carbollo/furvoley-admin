import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { getStripeConnectConfig } from '@/lib/club-settings'

/**
 * Crea o recupera el cliente Stripe del socio en la cuenta conectada del club.
 * No lanza si Stripe no está configurado (devuelve null).
 */
export async function ensureMemberStripeCustomer(memberId: string): Promise<string | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, name: true, email: true, phone: true, stripeCustomerId: true },
  })
  if (!member) return null

  const existing = member.stripeCustomerId?.trim()
  if (existing?.startsWith('cus_')) return existing

  const connect = await getStripeConnectConfig()
  if (!connect.hasConnectedAccount) {
    return null
  }

  try {
    const stripe = getStripe()
    const customer = await stripe.customers.create(
      {
        name: member.name,
        email: member.email?.trim() || undefined,
        phone: member.phone?.trim() || undefined,
        metadata: { memberId: member.id },
      },
      { stripeAccount: connect.connectedAccountId },
    )

    if (!customer.id.startsWith('cus_')) return null

    await prisma.member.update({
      where: { id: memberId },
      data: { stripeCustomerId: customer.id },
    })

    return customer.id
  } catch (err) {
    console.warn('[stripe-member-customer]', memberId, err)
    return null
  }
}

/** Persiste customer id devuelto por Checkout si aún no está en Member. */
export async function linkStripeCustomerFromCheckout(
  memberId: string,
  stripeCustomerId: string | null | undefined,
) {
  const cus = typeof stripeCustomerId === 'string' ? stripeCustomerId.trim() : ''
  if (!cus.startsWith('cus_')) return

  await prisma.member.updateMany({
    where: { id: memberId, stripeCustomerId: null },
    data: { stripeCustomerId: cus },
  })
}

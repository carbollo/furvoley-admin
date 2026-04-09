import { headers } from 'next/headers'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { recordInvoicePayment } from '@/app/actions/billing'

export async function POST(req: Request) {
  const body = await req.text()
  const signature = (await headers()).get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !secret) {
    return new Response('Missing signature or webhook secret', { status: 400 })
  }

  const stripe = getStripe()
  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret)
  } catch (err) {
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const invoiceId = session.metadata?.invoiceId || session.client_reference_id
    if (invoiceId) {
      const amount = (session.amount_total ?? 0) / 100
      await recordInvoicePayment({
        invoiceId,
        amount,
        method: 'STRIPE',
        status: 'SUCCEEDED',
        stripeSessionId: session.id,
        stripePaymentIntent:
          typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
      })
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object
    const invoice = await prisma.invoice.findFirst({
      where: { paymentAttempts: { some: { stripePaymentIntent: intent.id } } },
    })
    if (invoice) {
      await prisma.paymentAttempt.create({
        data: {
          invoiceId: invoice.id,
          amount: (intent.amount ?? 0) / 100,
          method: 'STRIPE',
          status: 'FAILED',
          stripePaymentIntent: intent.id,
          errorMessage: intent.last_payment_error?.message ?? 'Payment failed',
        },
      })
    }
  }

  if (event.type === 'invoice.paid') {
    const stripeInvoice = event.data.object
    const invoiceId =
      (stripeInvoice as { metadata?: Record<string, string> }).metadata?.invoiceId ?? null
    if (invoiceId) {
      await recordInvoicePayment({
        invoiceId,
        amount: (stripeInvoice.amount_paid ?? 0) / 100,
        method: 'STRIPE',
        status: 'SUCCEEDED',
      })
    }
  }

  return Response.json({ received: true })
}


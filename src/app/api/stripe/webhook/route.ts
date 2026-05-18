import { headers } from 'next/headers'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { recordInvoicePayment } from '@/app/actions/billing'
import type Stripe from 'stripe'

/**
 * Webhook único para eventos de la plataforma y de las cuentas conectadas
 * (Stripe Connect, Direct Charges). Aceptamos dos secrets:
 *
 *  - `STRIPE_WEBHOOK_SECRET`: eventos de la cuenta de la plataforma.
 *  - `STRIPE_CONNECT_WEBHOOK_SECRET`: eventos enviados al endpoint Connect
 *    (cobros que viven en una cuenta conectada — `event.account` poblado).
 *
 * Si solo configuras uno, el otro se ignora. Lo habitual es crear dos
 * endpoints en el Dashboard de Stripe con la misma URL y firmar cada uno
 * con su propio secret.
 */
export async function POST(req: Request) {
  const body = await req.text()
  const signature = (await headers()).get('stripe-signature')
  if (!signature) {
    return new Response('Missing signature', { status: 400 })
  }

  const platformSecret = process.env.STRIPE_WEBHOOK_SECRET
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!platformSecret && !connectSecret) {
    return new Response('No webhook secret configured', { status: 400 })
  }

  const stripe = getStripe()
  let event: Stripe.Event | null = null
  const errors: string[] = []
  for (const secret of [platformSecret, connectSecret]) {
    if (!secret) continue
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret)
      break
    } catch (err) {
      errors.push((err as Error).message)
    }
  }
  if (!event) {
    return new Response(`Webhook Error: ${errors.join(' | ')}`, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
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
    const intent = event.data.object as Stripe.PaymentIntent
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
    const stripeInvoice = event.data.object as Stripe.Invoice
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

  return Response.json({ received: true, account: event.account ?? null })
}

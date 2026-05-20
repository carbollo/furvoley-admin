import { headers } from 'next/headers'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { createInvoiceForSubscription, recordInvoicePayment } from '@/app/actions/billing'
import { getStripeConnectConfig } from '@/lib/club-settings'
import { linkStripeCustomerFromCheckout } from '@/lib/stripe-member-customer'
import type Stripe from 'stripe'

/**
 * Webhook único para eventos de la plataforma y de las cuentas conectadas
 * (Stripe Connect, Direct Charges).
 *
 * Política contable: los cobros llegados por Stripe **no** generan
 * Transaction/JournalEntry; la contabilidad oficial se carga importando el
 * CSV del banco y conciliando líneas (`/accounting/bank-import`).
 *
 * Firma: **solo** variables de entorno (configúralas a mano en Railway, etc.):
 *  - `STRIPE_WEBHOOK_SECRET` — endpoint de la cuenta plataforma.
 *  - `STRIPE_CONNECT_WEBHOOK_SECRET` — endpoint Connect (eventos con `event.account`).
 *  Ambas deben estar definidas; no se usan secretos persistidos en BD.
 *
 * Multi-deploy (varios clones en Railway, misma cuenta plataforma): Stripe
 * puede entregar cada evento Connect a **todos** los webhook endpoints Connect
 * dados de alta en el Dashboard/API. Este handler ignora (`200`) cualquier
 * evento cuyo `event.account` no sea el `acct_…` configurado para **este**
 * servicio (env var o BD), para no mezclar clubes ni devolver `500` por factura inexistente.
 */
export async function POST(req: Request) {
  const body = await req.text()
  const signature = (await headers()).get('stripe-signature')
  if (!signature) {
    return new Response('Missing signature', { status: 400 })
  }

  const platformSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim() || null
  const connectSecret = (process.env.STRIPE_CONNECT_WEBHOOK_SECRET || '').trim() || null
  if (!platformSecret || !connectSecret) {
    return new Response(
      'Missing STRIPE_WEBHOOK_SECRET or STRIPE_CONNECT_WEBHOOK_SECRET (both required as environment variables)',
      { status: 503 }
    )
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

  // Para llamar a APIs de Stripe sobre la cuenta conectada (p.ej. recuperar
  // un payment_intent), reutilizamos `event.account` como stripeAccount.
  const stripeAccount =
    typeof (event as { account?: string | null }).account === 'string'
      ? ((event as { account: string }).account)
      : null
  const requestOptions: Stripe.RequestOptions | undefined = stripeAccount
    ? { stripeAccount }
    : undefined

  const connectCfg = await getStripeConnectConfig()
  if (stripeAccount) {
    const ours =
      connectCfg.hasConnectedAccount && connectCfg.connectedAccountId === stripeAccount
    if (!ours) {
      console.info(
        '[stripe webhook] ignored Connect event for other account:',
        stripeAccount,
        'this service:',
        connectCfg.connectedAccountId || '(none)'
      )
      return Response.json({
        received: true,
        ignored: true,
        reason: 'connect_account_not_this_service',
        type: event.type,
      })
    }
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await onCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        await onInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      }
      case 'invoice.payment_failed': {
        await onInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break
      }
      case 'payment_intent.payment_failed': {
        await onPaymentIntentFailed(event.data.object as Stripe.PaymentIntent)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await onSubscriptionUpserted(event.data.object as Stripe.Subscription)
        break
      }
      case 'customer.subscription.deleted': {
        await onSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      }
      default:
        // Evento no manejado — devolvemos 200 para no reintenten.
        break
    }
  } catch (err) {
    console.error('[stripe webhook] handler error', event.type, err)
    return new Response('Handler error', { status: 500 })
  }

  return Response.json({ received: true, type: event.type, account: stripeAccount ?? null })
  void requestOptions // reservado para futuras llamadas a Stripe API sobre la cuenta conectada
}

// ─── Handlers ─────────────────────────────────────────────────────────────

async function onCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  // Modo pago puntual (factura/payment ad-hoc)
  if (session.mode === 'payment') {
    const invoiceId = session.metadata?.invoiceId || session.client_reference_id || null
    const memberId = session.metadata?.memberId || null
    const stripeCustomerId =
      typeof session.customer === 'string' ? session.customer : null
    if (memberId && stripeCustomerId) {
      await linkStripeCustomerFromCheckout(memberId, stripeCustomerId)
    }
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
    return
  }

  // Modo suscripción: vincula nuestra Subscription con la de Stripe
  if (session.mode === 'subscription') {
    const internalSubscriptionId =
      session.metadata?.subscriptionId || session.client_reference_id || null
    const stripeSubscriptionId =
      typeof session.subscription === 'string' ? session.subscription : null
    const stripeCustomerId =
      typeof session.customer === 'string' ? session.customer : null
    if (internalSubscriptionId && stripeSubscriptionId) {
      const exists = await prisma.subscription.findUnique({
        where: { id: internalSubscriptionId },
        select: { id: true },
      })
      if (exists) {
        await prisma.subscription.update({
          where: { id: internalSubscriptionId },
          data: {
            stripeSubscriptionId,
            stripeCustomerId: stripeCustomerId ?? undefined,
            autoPay: true,
            status: 'ACTIVE',
          },
        })
      }
    }
    // El primer cobro se procesa en `invoice.payment_succeeded` para evitar duplicados.
    return
  }
}

type LegacyInvoice = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null
  payment_intent?: string | Stripe.PaymentIntent | null
}

async function onInvoicePaymentSucceeded(rawInvoice: Stripe.Invoice) {
  const stripeInvoice = rawInvoice as LegacyInvoice
  const amountPaid = (stripeInvoice.amount_paid ?? 0) / 100
  const stripeSubscriptionId =
    typeof stripeInvoice.subscription === 'string' ? stripeInvoice.subscription : null
  const stripePaymentIntent =
    typeof stripeInvoice.payment_intent === 'string' ? stripeInvoice.payment_intent : null

  // Caso A: la factura interna se identifica explícitamente vía metadata.
  const metaInvoiceId =
    (stripeInvoice as { metadata?: Record<string, string> | null }).metadata?.invoiceId || null
  if (metaInvoiceId) {
    if (await alreadyRecorded(stripePaymentIntent)) return
    await recordInvoicePayment({
      invoiceId: metaInvoiceId,
      amount: amountPaid,
      method: 'STRIPE',
      status: 'SUCCEEDED',
      stripePaymentIntent: stripePaymentIntent ?? undefined,
    })
    return
  }

  // Caso B: cobro recurrente de una suscripción Stripe vinculada.
  if (stripeSubscriptionId) {
    if (await alreadyRecorded(stripePaymentIntent)) return
    const subscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
    })
    if (!subscription) return

    // Genera la siguiente factura interna del período y márcala como pagada.
    // (createInvoiceForSubscription también avanza `nextInvoiceDate`.)
    const newInvoice = await createInvoiceForSubscription(subscription.id)
    await recordInvoicePayment({
      invoiceId: newInvoice.id,
      amount: amountPaid,
      method: 'STRIPE',
      status: 'SUCCEEDED',
      stripePaymentIntent: stripePaymentIntent ?? undefined,
    })
  }
}

async function onInvoicePaymentFailed(rawInvoice: Stripe.Invoice) {
  const stripeInvoice = rawInvoice as LegacyInvoice
  const stripeSubscriptionId =
    typeof stripeInvoice.subscription === 'string' ? stripeInvoice.subscription : null
  const stripePaymentIntent =
    typeof stripeInvoice.payment_intent === 'string' ? stripeInvoice.payment_intent : null

  if (stripeSubscriptionId) {
    const subscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
    })
    if (subscription) {
      // Marca la última factura pendiente de esa suscripción como OVERDUE.
      const lastPending = await prisma.invoice.findFirst({
        where: { subscriptionId: subscription.id, status: { in: ['PENDING', 'PARTIAL'] } },
        orderBy: { issueDate: 'desc' },
      })
      if (lastPending) {
        await prisma.paymentAttempt.create({
          data: {
            invoiceId: lastPending.id,
            amount: (stripeInvoice.amount_due ?? 0) / 100,
            method: 'STRIPE',
            status: 'FAILED',
            stripePaymentIntent: stripePaymentIntent ?? undefined,
            errorMessage: 'Stripe invoice.payment_failed',
          },
        })
        await prisma.invoice.update({
          where: { id: lastPending.id },
          data: { status: 'OVERDUE' },
        })
      }
    }
  }
}

async function onPaymentIntentFailed(intent: Stripe.PaymentIntent) {
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

async function onSubscriptionUpserted(sub: Stripe.Subscription) {
  const stripeSubscriptionId = sub.id
  const status = mapStripeSubscriptionStatus(sub.status)
  const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : null
  const internal = await prisma.subscription.findFirst({ where: { stripeSubscriptionId } })
  if (!internal) return
  await prisma.subscription.update({
    where: { id: internal.id },
    data: {
      status,
      stripeCustomerId: stripeCustomerId ?? undefined,
      endDate: status === 'CANCELED' ? new Date() : null,
    },
  })
}

async function onSubscriptionDeleted(sub: Stripe.Subscription) {
  const internal = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: sub.id },
  })
  if (!internal) return
  await prisma.subscription.update({
    where: { id: internal.id },
    data: { status: 'CANCELED', endDate: new Date() },
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function alreadyRecorded(stripePaymentIntent: string | null) {
  if (!stripePaymentIntent) return false
  const existing = await prisma.paymentAttempt.findFirst({
    where: { stripePaymentIntent, status: 'SUCCEEDED' },
    select: { id: true },
  })
  return !!existing
}

function mapStripeSubscriptionStatus(stripeStatus: string): 'ACTIVE' | 'PAUSED' | 'CANCELED' {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'ACTIVE'
    case 'paused':
      return 'PAUSED'
    case 'canceled':
    case 'incomplete_expired':
    case 'unpaid':
      return 'CANCELED'
    default:
      return 'ACTIVE'
  }
}

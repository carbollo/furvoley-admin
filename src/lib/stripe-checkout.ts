import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getClubIssuer, getStripeConnectConfig } from '@/lib/club-settings'
import { getStripe } from '@/lib/stripe'
import { ensureMemberStripeCustomer } from '@/lib/stripe-member-customer'

function stripeErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; code?: string; raw?: { message?: string } }
    const msg = e.raw?.message || e.message
    if (msg) {
      if (e.code === 'resource_missing' && msg.includes('customer')) {
        return 'Cliente de Stripe no válido. Vuelve a pulsar Pagar; se creará un enlace nuevo.'
      }
      if (msg.includes('charges_enabled') || msg.includes('cannot accept')) {
        return 'La cuenta de Stripe del club aún no puede cobrar. El administrador debe completar el onboarding en el CRM.'
      }
      return msg
    }
  }
  return 'No se pudo iniciar el pago con Stripe.'
}

function isMissingCustomerError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string; param?: string }
  return (
    e.code === 'resource_missing' &&
    (e.param === 'customer' || (e.message || '').toLowerCase().includes('customer'))
  )
}

export type InvoiceCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/** Resuelve customer / customer_email para Checkout en la cuenta correcta (Connect o plataforma). */
async function resolveCheckoutCustomerFields(
  memberId: string,
  member: { email?: string | null },
  connect: Awaited<ReturnType<typeof getStripeConnectConfig>>,
): Promise<Pick<Stripe.Checkout.SessionCreateParams, 'customer' | 'customer_email'>> {
  const email = member.email?.trim() || undefined
  let stripeCustomerId = await ensureMemberStripeCustomer(memberId)

  if (stripeCustomerId?.startsWith('cus_')) {
    try {
      const stripe = getStripe()
      const opts: Stripe.RequestOptions | undefined = connect.hasConnectedAccount
        ? { stripeAccount: connect.connectedAccountId }
        : undefined
      await stripe.customers.retrieve(stripeCustomerId, opts)
      return { customer: stripeCustomerId }
    } catch {
      await prisma.member.update({
        where: { id: memberId },
        data: { stripeCustomerId: null },
      })
      stripeCustomerId = null
    }
  }

  if (email) return { customer_email: email }
  throw new Error(
    'El socio necesita un email en su ficha para pagar con Stripe. Pide al club que lo actualice.',
  )
}

export async function createInvoiceCheckoutUrl(invoiceId: string): Promise<InvoiceCheckoutResult> {
  try {
    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      return { ok: false, error: 'Stripe no está configurado en el servidor (falta STRIPE_SECRET_KEY).' }
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { member: true },
    })
    if (!invoice) return { ok: false, error: 'Factura no encontrada.' }

    const pendingAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount)
    if (pendingAmount <= 0) return { ok: false, error: 'Esta factura ya está pagada.' }

    if (invoice.stripeCheckoutUrl?.startsWith('https://')) {
      return { ok: true, url: invoice.stripeCheckoutUrl }
    }

    const connect = await getStripeConnectConfig()
    if (connect.hasConnectedAccount && connect.chargesEnabled === false) {
      return {
        ok: false,
        error:
          'La cuenta de Stripe del club aún no puede cobrar. El administrador debe completar el onboarding en Configuración / Stripe.',
      }
    }

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null) ||
      'http://localhost:3000'
    ).replace(/\/$/, '')

    const issuer = await getClubIssuer()
    const clubSlug =
      issuer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'club'
    const pendingCents = Math.round(pendingAmount * 100)
    if (pendingCents < 50) {
      return { ok: false, error: 'El importe pendiente es demasiado bajo para cobrar con Stripe.' }
    }

    const applicationFeeCents =
      connect.applicationFeePercent > 0
        ? Math.round((pendingCents * connect.applicationFeePercent) / 100)
        : 0

    const customerFields = await resolveCheckoutCustomerFields(invoice.memberId, invoice.member, connect)

    const stripe = getStripe()
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      client_reference_id: invoice.id,
      ...customerFields,
      metadata: {
        invoiceId: invoice.id,
        memberId: invoice.memberId,
        clubId: clubSlug,
        clubName: issuer.name,
        clubLegalName: issuer.legalName || '',
        clubTaxId: issuer.taxId || '',
        stripeAccount: connect.connectedAccountId || '',
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (invoice.currency || 'EUR').toLowerCase(),
            unit_amount: pendingCents,
            product_data: {
              name: `${issuer.name} · Factura ${invoice.invoiceNumber}`,
              description: `Socio: ${invoice.member.name}`,
            },
          },
        },
      ],
      success_url: `${appUrl}/my-billing?success=true`,
      cancel_url: `${appUrl}/my-billing?canceled=true`,
      payment_intent_data: {
        metadata: { invoiceId: invoice.id, memberId: invoice.memberId },
        ...(applicationFeeCents > 0 ? { application_fee_amount: applicationFeeCents } : {}),
      },
    }

    const requestOptions: Stripe.RequestOptions | undefined = connect.hasConnectedAccount
      ? { stripeAccount: connect.connectedAccountId }
      : undefined

    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.create(params, requestOptions)
    } catch (err) {
      if (params.customer && isMissingCustomerError(err)) {
        await prisma.member.update({
          where: { id: invoice.memberId },
          data: { stripeCustomerId: null },
        })
        const email = invoice.member.email?.trim()
        const retryParams: Stripe.Checkout.SessionCreateParams = {
          ...params,
          customer: undefined,
          ...(email ? { customer_email: email } : {}),
        }
        if (!email) {
          return { ok: false, error: stripeErrorMessage(err) }
        }
        session = await stripe.checkout.sessions.create(retryParams, requestOptions)
      } else {
        throw err
      }
    }

    const url = session.url
    if (!url) return { ok: false, error: 'Stripe no devolvió URL de pago.' }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        stripeCheckoutUrl: url,
        stripeSessionId: session.id,
      },
    })

    return { ok: true, url }
  } catch (err) {
    console.error('[stripe-checkout] createInvoiceCheckoutUrl', invoiceId, err)
    return { ok: false, error: stripeErrorMessage(err) }
  }
}

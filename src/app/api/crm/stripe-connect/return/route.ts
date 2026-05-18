import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'

/**
 * Endpoint al que vuelve el admin tras completar el onboarding hospedado por
 * Stripe. Refrescamos el estado de la cuenta y redirigimos al CRM con un
 * flag en query string para que el modal lo muestre.
 */
export async function GET() {
  try {
    if (process.env.STRIPE_SECRET_KEY) {
      const row = await prisma.clubSettings.findUnique({ where: { isDefault: true } })
      const acct = row?.stripeConnectedAccountId
      if (acct) {
        const stripe = getStripe()
        try {
          const a = await stripe.accounts.retrieve(acct)
          await prisma.clubSettings.update({
            where: { isDefault: true },
            data: {
              stripeChargesEnabled: !!a.charges_enabled,
              stripePayoutsEnabled: !!a.payouts_enabled,
              stripeDetailsSubmitted: !!a.details_submitted,
              stripeAccountStatusAt: new Date(),
            },
          })
        } catch {
          // Si falla, dejamos el estado anterior.
        }
      }
    }
  } catch {
    // No bloqueamos la redirección si Prisma/Stripe fallan.
  }
  return NextResponse.redirect(buildRedirect('connected'))
}

function buildRedirect(state: string): string {
  const base =
    (process.env.NEXT_PUBLIC_APP_URL || '').trim() ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : '')
  const root = base.replace(/\/+$/, '') || ''
  return `${root}/?stripeConnect=${encodeURIComponent(state)}`
}

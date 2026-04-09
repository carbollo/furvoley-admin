import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe() {
  if (stripeClient) return stripeClient
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is required to use Stripe')
  }
  stripeClient = new Stripe(key, {
    apiVersion: '2026-03-25.dahlia',
  })
  return stripeClient
}

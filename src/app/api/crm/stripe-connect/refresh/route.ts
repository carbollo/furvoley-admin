import { NextResponse } from 'next/server'

/**
 * Endpoint al que Stripe redirige si el AccountLink caduca o si el usuario
 * pulsa "Volver al sitio". Reenviamos al CRM con un flag para que la UI
 * abra otra vez el modal y permita reanudar el onboarding.
 */
export async function GET() {
  const base =
    (process.env.NEXT_PUBLIC_APP_URL || '').trim() ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : '')
  const root = base.replace(/\/+$/, '') || ''
  return NextResponse.redirect(`${root}/?stripeConnect=refresh`)
}

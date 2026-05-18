import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getStripe } from '@/lib/stripe'
import { getStripeConnectConfig } from '@/lib/club-settings'

/**
 * Devuelve una URL para abrir el dashboard de la cuenta conectada del cliente
 * (club). El behaviour depende del tipo de dashboard configurado en la cuenta
 * conectada:
 *
 *  - Dashboard "express" → `stripe.accounts.createLoginLink(acct_…)` devuelve
 *    un login link de un solo uso para el dashboard Express del cliente.
 *  - Dashboard "full" / cuentas Standard → no admite login link generado por
 *    la plataforma; redirige a `https://dashboard.stripe.com/` para que el
 *    cliente entre con sus credenciales.
 *  - Sin dashboard → enviamos al cliente al dashboard de la plataforma.
 *
 * Account ID se lee de la env var `STRIPE_CONNECTED_ACCOUNT_ID`.
 */
export async function POST() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const connect = getStripeConnectConfig()
  if (!connect.hasConnectedAccount) {
    return NextResponse.json(
      {
        error:
          'No hay STRIPE_CONNECTED_ACCOUNT_ID configurado en Railway. Añade la variable con el `acct_…` del cliente conectado y vuelve a desplegar.',
      },
      { status: 400 }
    )
  }

  const stripe = getStripe()
  try {
    const link = await stripe.accounts.createLoginLink(connect.connectedAccountId)
    return NextResponse.json({ url: link.url, source: 'express' })
  } catch (e: any) {
    const msg = String(e?.message || '')
    // El error típico cuando la cuenta no es Express y por tanto no admite
    // login links. En ese caso devolvemos el dashboard genérico de Stripe.
    const dashboardUrl = 'https://dashboard.stripe.com/'
    return NextResponse.json({
      url: dashboardUrl,
      source: 'fallback',
      note:
        'La cuenta conectada no admite login link automático (probablemente sea Standard/Full). ' +
        'Pide al cliente que inicie sesión con sus credenciales. Detalle: ' + msg,
    })
  }
}

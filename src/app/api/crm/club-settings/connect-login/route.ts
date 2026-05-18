import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getStripe } from '@/lib/stripe'
import { getStripeConnectConfig } from '@/lib/club-settings'

/**
 * Devuelve una URL para abrir el dashboard de **la cuenta conectada del
 * cliente** (el club), nunca el de la plataforma. Estrategia:
 *
 *  1. Si la cuenta conectada tiene dashboard "express", usamos
 *     `stripe.accounts.createLoginLink(acct_…)` → devuelve un login link de
 *     un solo uso al dashboard Express del cliente.
 *  2. Si la cuenta es Standard/Full, `createLoginLink` falla con
 *     `accounts/login_links/unsupported_account_type` (o similar). En ese
 *     caso devolvemos la URL **path-scoped al acct_id**
 *     (`https://dashboard.stripe.com/<acct_id>/dashboard`), que envía al
 *     cliente a SU cuenta directamente (Stripe le pide login si hace falta).
 *     Si quien abre el link tiene sesión en otra cuenta de Stripe, la URL
 *     fuerza el cambio a la cuenta del cliente.
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

  // Fallback siempre apunta a la cuenta del cliente, no a la mía.
  const clientDashboardUrl = `https://dashboard.stripe.com/${connect.connectedAccountId}/dashboard`

  const stripe = getStripe()
  try {
    const link = await stripe.accounts.createLoginLink(connect.connectedAccountId)
    return NextResponse.json({ url: link.url, source: 'express' })
  } catch (e: any) {
    const code = String(e?.code || '')
    const msg = String(e?.message || '')
    return NextResponse.json({
      url: clientDashboardUrl,
      source: 'standard',
      accountId: connect.connectedAccountId,
      note:
        'Esta cuenta conectada no admite login link automático (no es Express). ' +
        'Abrimos directamente el dashboard de la cuenta del cliente; Stripe pedirá login si es necesario.' +
        (msg ? ` Detalle: ${code || 'stripe_error'}: ${msg}` : ''),
    })
  }
}

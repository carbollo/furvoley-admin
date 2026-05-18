import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getStripe } from '@/lib/stripe'
import { getStripePortalConfig } from '@/lib/club-settings'

/**
 * Crea una sesión del Stripe Billing Portal para que el ADMIN del club
 * gestione la suscripción del club al SaaS (cambiar tarjeta, ver facturas,
 * actualizar plan, etc.). El customer ID se lee de la variable de entorno
 * `STRIPE_CLUB_CUSTOMER_ID` (configurada en Railway), NO del modal.
 */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const cfg = getStripePortalConfig()
  if (!cfg.hasCustomerId) {
    return NextResponse.json(
      {
        error:
          'No hay STRIPE_CLUB_CUSTOMER_ID configurado en Railway. Añade la variable de entorno con tu customer ID (empieza por cus_…) y vuelve a desplegar.',
      },
      { status: 400 }
    )
  }

  try {
    const url = new URL(request.url)
    const origin = url.origin
    const stripe = getStripe()
    const session = await stripe.billingPortal.sessions.create({
      customer: cfg.customerId,
      return_url: origin + '/?tab=dashboard',
    })
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    const code = String(e?.code || '')
    const msg = String(e?.message || 'No se pudo abrir el portal de Stripe')
    if (code === 'resource_missing') {
      return NextResponse.json(
        {
          error:
            'El STRIPE_CLUB_CUSTOMER_ID configurado no existe en esta cuenta de Stripe. Comprueba la variable de entorno en Railway.',
        },
        { status: 404 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

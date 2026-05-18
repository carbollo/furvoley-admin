import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { getStripe } from '@/lib/stripe'

/**
 * Crea una sesión del Stripe Billing Portal para que el ADMIN del club
 * gestione la suscripción del club al SaaS (cambiar tarjeta, ver facturas,
 * actualizar plan, etc.). Requiere que `clubSettings.stripeCustomerId` esté
 * configurado en el modal de configuración del club.
 */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const settings = await prisma.clubSettings.findUnique({ where: { isDefault: true } })
  const customerId = settings?.stripeCustomerId?.trim()

  if (!customerId) {
    return NextResponse.json(
      {
        error:
          'Aún no has vinculado un Stripe Customer ID. Ve a "Configuración del club" > "Suscripción" e introdúcelo (empieza por cus_…).',
      },
      { status: 400 }
    )
  }

  try {
    const url = new URL(request.url)
    const origin = url.origin
    const stripe = getStripe()
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: origin + '/?tab=dashboard',
    })
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    const code = String(e?.code || '')
    const msg = String(e?.message || 'No se pudo abrir el portal de Stripe')
    if (code === 'resource_missing') {
      return NextResponse.json(
        { error: 'El Stripe Customer ID configurado no existe en esta cuenta de Stripe.' },
        { status: 404 }
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

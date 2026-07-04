import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'

/**
 * Desvincula la cuenta conectada del CRM (no la elimina en Stripe).
 *
 * Stripe **no** permite borrar Express accounts vía API una vez creadas. Lo
 * que hacemos aquí es limpiar `stripeConnectedAccountId` y los flags de
 * estado en `ClubSettings`. Si la env var `STRIPE_CONNECTED_ACCOUNT_ID` está
 * definida, prevalece y este endpoint no tiene efecto (se devuelve 409).
 */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const env = (process.env.STRIPE_CONNECTED_ACCOUNT_ID || '').trim()
  if (env.startsWith('acct_')) {
    return NextResponse.json(
      {
        error:
          'La cuenta proviene de STRIPE_CONNECTED_ACCOUNT_ID (env var). Para desconectarla elimina la variable en Railway.',
      },
      { status: 409 }
    )
  }

  await prisma.clubSettings.update({
    where: { isDefault: true },
    data: {
      stripeConnectedAccountId: null,
      stripeAccountType: 'express',
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
      stripeAccountStatusAt: null,
    },
  })

  return NextResponse.json({ ok: true })
}

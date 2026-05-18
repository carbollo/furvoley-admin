import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { getStripe } from '@/lib/stripe'

/**
 * Consulta el estado de la cuenta conectada en Stripe (`accounts.retrieve`) y
 * actualiza los flags cacheados en `ClubSettings`:
 *   - `stripeChargesEnabled`
 *   - `stripePayoutsEnabled`
 *   - `stripeDetailsSubmitted`
 *
 * Útil tras volver del onboarding o como botón de refresco en el modal.
 *
 * Si `STRIPE_CONNECTED_ACCOUNT_ID` está en env vars, **no** mutamos BD y solo
 * devolvemos el snapshot leído.
 */
export async function POST() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const env = (process.env.STRIPE_CONNECTED_ACCOUNT_ID || '').trim()
  const isEnvOverride = env.startsWith('acct_')

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY no está configurada.' },
      { status: 400 }
    )
  }

  let acctId = ''
  if (isEnvOverride) {
    acctId = env
  } else {
    const row = await prisma.clubSettings.findUnique({ where: { isDefault: true } })
    acctId = row?.stripeConnectedAccountId || ''
  }

  if (!acctId) {
    return NextResponse.json({ error: 'No hay cuenta conectada para refrescar.' }, { status: 400 })
  }

  const stripe = getStripe()
  let account
  try {
    account = await stripe.accounts.retrieve(acctId)
  } catch (e) {
    return NextResponse.json(
      { error: 'No se pudo leer la cuenta en Stripe', detail: (e as Error).message },
      { status: 400 }
    )
  }

  const status = {
    accountId: account.id,
    type: account.type,
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
    detailsSubmitted: !!account.details_submitted,
    requirementsDue: (account.requirements?.currently_due?.length ?? 0) > 0,
    statusAt: new Date().toISOString(),
  }

  if (!isEnvOverride) {
    await prisma.clubSettings.update({
      where: { isDefault: true },
      data: {
        stripeAccountType: account.type === 'express' || account.type === 'standard' || account.type === 'custom'
          ? account.type
          : 'express',
        stripeChargesEnabled: status.chargesEnabled,
        stripePayoutsEnabled: status.payoutsEnabled,
        stripeDetailsSubmitted: status.detailsSubmitted,
        stripeAccountStatusAt: new Date(),
      },
    })
  }

  return NextResponse.json({ status })
}

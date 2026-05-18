import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { getStripe } from '@/lib/stripe'
import { getClubIssuer } from '@/lib/club-settings'
import { detectPublicBaseUrl } from '@/lib/stripe-bootstrap'

/**
 * Inicia (o continúa) el onboarding de Stripe Connect Express para el club.
 *
 * - Si no existe `acct_…` en BD ni en env var, crea una nueva cuenta Express
 *   con `stripe.accounts.create({ type: 'express', … })` y la persiste en
 *   `ClubSettings.stripeConnectedAccountId`.
 * - Genera un `AccountLink` (`type: 'account_onboarding'`) y devuelve la URL
 *   para que el admin la abra en una pestaña nueva.
 * - Las URLs `refresh_url` y `return_url` apuntan al CRM (rutas
 *   `/api/crm/stripe-connect/refresh` y `/api/crm/stripe-connect/return`).
 *
 * Si la env var `STRIPE_CONNECTED_ACCOUNT_ID` está definida, se considera que
 * el operador ya gestiona la cuenta externamente y devolvemos 409.
 */
export async function POST() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const envOverride = (process.env.STRIPE_CONNECTED_ACCOUNT_ID || '').trim()
  if (envOverride.startsWith('acct_')) {
    return NextResponse.json(
      {
        error:
          'STRIPE_CONNECTED_ACCOUNT_ID está definida en Railway y tiene prioridad. ' +
          'Elimínala si quieres conectar una cuenta nueva desde el CRM.',
      },
      { status: 409 }
    )
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY no está configurada en Railway.' },
      { status: 400 }
    )
  }

  const base = detectPublicBaseUrl()
  if (!base) {
    return NextResponse.json(
      {
        error:
          'No se pudo detectar la URL pública. Define NEXT_PUBLIC_APP_URL o asegúrate de desplegar en Railway.',
      },
      { status: 400 }
    )
  }

  const stripe = getStripe()
  const issuer = await getClubIssuer()

  // Buscar acct existente en BD.
  let row = await prisma.clubSettings.findUnique({ where: { isDefault: true } })
  if (!row) {
    row = await prisma.clubSettings.create({
      data: { isDefault: true, name: issuer.name || 'Furvoley' },
    })
  }

  let acctId = row.stripeConnectedAccountId

  if (!acctId) {
    // Crear nueva Express account.
    try {
      const country = mapCountryToISO(issuer.addressLines.find((l) => /españa|spain/i.test(l)))
      const account = await stripe.accounts.create({
        type: 'express',
        country: country,
        email: issuer.contactEmail || undefined,
        business_profile: {
          name: issuer.legalName || issuer.name,
          support_email: issuer.contactEmail || undefined,
          support_phone: issuer.contactPhone || undefined,
          url: issuer.website || undefined,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          clubName: issuer.name,
          clubLegalName: issuer.legalName || '',
          clubTaxId: issuer.taxId || '',
        },
      })
      acctId = account.id
      row = await prisma.clubSettings.update({
        where: { isDefault: true },
        data: {
          stripeConnectedAccountId: acctId,
          stripeAccountType: 'express',
          stripeChargesEnabled: account.charges_enabled ?? false,
          stripePayoutsEnabled: account.payouts_enabled ?? false,
          stripeDetailsSubmitted: account.details_submitted ?? false,
          stripeAccountStatusAt: new Date(),
        },
      })
    } catch (e) {
      const raw = e as { message?: string; code?: string; type?: string; statusCode?: number }
      const detail = typeof raw.message === 'string' ? raw.message : String(e)
      const code = typeof raw.code === 'string' ? raw.code : ''

      /** Solo mapeamos códigos explícitos. NUNCA uses `detail.includes('connect')`:
       * palabras como "connected" también contienen "connect" y mostrábamos
       * un mensaje equivocado ("Connect no activado") para errores totalmente otros. */
      let error =
        'Stripe rechazó crear la cuenta conectada. Revisa `detail` (texto técnico) y el modo Test/Live de tu STRIPE_SECRET_KEY.'
      if (code === 'connect_not_enabled') {
        error =
          'Connect no está activado para esta cuenta. En Stripe Dashboard → Connect, completa el registro de plataforma (mismo modo Test/Live que tu clave).'
      }
      if (code === 'invalid_request_error' && detail.includes('capabilities')) {
        error =
          'Stripe rechazó las capacidades pedidas para este país/modalidad. Revisa Connect Settings o prueba en modo Test.'
      }

      console.error('[stripe-connect/start] accounts.create failed', { code, detail })

      return NextResponse.json({ error, detail, stripeCode: code || undefined }, { status: 400 })
    }
  }

  const link = await stripe.accountLinks.create({
    account: acctId,
    refresh_url: `${base}/api/crm/stripe-connect/refresh`,
    return_url: `${base}/api/crm/stripe-connect/return`,
    type: 'account_onboarding',
    collection_options: { fields: 'eventually_due' },
  })

  return NextResponse.json({
    url: link.url,
    accountId: acctId,
    expiresAt: link.expires_at,
  })
}

function mapCountryToISO(line: string | undefined): string {
  // Onboarding Express requiere un country code ISO 3166-1 alpha-2. Por
  // defecto España.
  if (!line) return 'ES'
  const lower = line.toLowerCase()
  if (lower.includes('españa') || lower.includes('spain')) return 'ES'
  if (lower.includes('portugal')) return 'PT'
  if (lower.includes('france') || lower.includes('francia')) return 'FR'
  if (lower.includes('italy') || lower.includes('italia')) return 'IT'
  if (lower.includes('germany') || lower.includes('alemania')) return 'DE'
  return 'ES'
}

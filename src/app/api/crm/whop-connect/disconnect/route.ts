import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRoles } from '@/lib/rbac-api'
import { releaseWhopCompany } from '@/lib/whop/company-claim'

/**
 * Desconecta la pasarela del club: borra la key y el secret del webhook guardados
 * en el CRM y libera la cuenta en el directorio del portal. NO toca nada en la
 * pasarela — la cuenta del club, su dinero y su historial siguen siendo suyos.
 *
 * Si el borrado falla se devuelve error: decirle al admin que ha revocado el
 * acceso cuando la credencial sigue guardada sería una mentira peligrosa.
 */
export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  try {
    await prisma.clubSettings.update({
      where: { isDefault: true },
      data: {
        whopApiKey: null,
        whopWebhookSecret: null,
        whopCompanyId: null,
        whopOnboardingStatus: 'NONE',
        whopChargesEnabled: false,
        whopPayoutsEnabled: false,
        whopPayoutMethodId: null,
        whopLastSweepAt: null,
        whopAccountStatusAt: new Date(),
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'No se pudo desconectar la pasarela. Vuelve a intentarlo.' },
      { status: 500 },
    )
  }

  // Enlaces y planes espejados dejan de ser utilizables sin la cuenta conectada.
  await prisma.whopPlanMapping.deleteMany({}).catch(() => null)
  await prisma.invoice
    .updateMany({
      where: { whopCheckoutUrl: { not: null } },
      data: { whopCheckoutUrl: null, whopCheckoutId: null, whopCheckoutAmount: null },
    })
    .catch(() => null)

  await releaseWhopCompany()

  return NextResponse.json({ ok: true })
}

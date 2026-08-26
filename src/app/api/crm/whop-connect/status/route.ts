import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/rbac-api'
import { getWhopClubConfig, getWhopClubCredential } from '@/lib/whop/club-config'
import { checkScopes } from '@/lib/whop/connect'

/**
 * Estado de la pasarela Whop del club: config guardada + comprobación en vivo de
 * los permisos de la API key (para avisar si el club la ha rotado o recortado).
 * Nunca devuelve la key ni el secret del webhook.
 */
/** Estado apto para el navegador: sin identificadores crudos ni tokens. */
function publicStatus(c: Awaited<ReturnType<typeof getWhopClubConfig>>) {
  return {
    hasCompany: c.hasCompany,
    companyIdMasked: c.companyIdMasked,
    onboardingStatus: c.onboardingStatus,
    chargesEnabled: c.chargesEnabled,
    payoutsEnabled: c.payoutsEnabled,
    hasPayoutMethod: c.hasPayoutMethod,
    canCharge: c.canCharge,
    statusAt: c.statusAt,
  }
}

export async function POST(request: Request) {
  const auth = await requireRoles(['ADMIN'], request)
  if (!auth.ok) return auth.response

  const config = await getWhopClubConfig()
  if (!config.hasCompany) {
    return NextResponse.json({ status: publicStatus(config), scopes: [], keyValid: null })
  }

  const credential = await getWhopClubCredential()
  if (!credential) {
    return NextResponse.json({ status: publicStatus(config), scopes: [], keyValid: false })
  }

  const check = await checkScopes(credential, config.companyId)
  return NextResponse.json({
    status: publicStatus(config),
    scopes: check.status === 'ok' ? check.scopes : [],
    // true = la clave responde; false = revocada o rotada; null = no se pudo
    // comprobar (caída de red), que NO es lo mismo que una clave mala.
    keyValid: check.status === 'ok' ? true : check.status === 'invalid_key' ? false : null,
  })
}

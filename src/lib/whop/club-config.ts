import { prisma } from '@/lib/prisma'
import { currentTenant } from '@/lib/multitenant/context'
import type { WhopCredential } from '@/lib/whop/client'
import { openSecret } from '@/lib/whop/secret-box'

/**
 * Configuración de la pasarela Whop DEL CLUB activo (se lee de la BD del tenant;
 * el proxy de prisma ya enruta al club correcto). Módulo de servidor puro, sin
 * 'use server': maneja secretos (API key y webhook secret del club).
 */

export type WhopOnboardingStatus = 'NONE' | 'PENDING_KYC' | 'PENDING_BANK' | 'READY' | 'DISABLED'

export type WhopClubConfig = {
  companyId: string
  hasCompany: boolean
  companyIdMasked: string
  onboardingStatus: WhopOnboardingStatus
  chargesEnabled: boolean
  payoutsEnabled: boolean
  payoutMethodId: string
  hasPayoutMethod: boolean
  /** Divisa en la que la cuenta bancaria del club recibe el dinero. */
  payoutCurrency: string
  sweepFrequency: 'OFF' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
  sweepMinAmount: number
  lastSweepAt: string | null
  statusAt: string | null
  /** true si el club puede cobrar ya (cuenta creada + cobros habilitados). */
  canCharge: boolean
}

function mask(id: string): string {
  return id ? id.slice(0, 8) + '…' + id.slice(-4) : ''
}

function normalizeStatus(v: unknown): WhopOnboardingStatus {
  const s = String(v || 'NONE').toUpperCase()
  return (['NONE', 'PENDING_KYC', 'PENDING_BANK', 'READY', 'DISABLED'] as const).includes(
    s as WhopOnboardingStatus,
  )
    ? (s as WhopOnboardingStatus)
    : 'NONE'
}

function normalizeFrequency(v: unknown): WhopClubConfig['sweepFrequency'] {
  const s = String(v || 'WEEKLY').toUpperCase()
  return (['OFF', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).includes(s as 'OFF')
    ? (s as WhopClubConfig['sweepFrequency'])
    : 'WEEKLY'
}

/** Config pública (sin secretos) de la pasarela del club activo. */
export async function getWhopClubConfig(): Promise<WhopClubConfig> {
  let s: {
    whopCompanyId: string | null
    whopOnboardingStatus: string | null
    whopChargesEnabled: boolean | null
    whopPayoutsEnabled: boolean | null
    whopPayoutMethodId: string | null
    whopPayoutCurrency: string | null
    whopSweepFrequency: string | null
    whopSweepMinAmount: number | null
    whopLastSweepAt: Date | null
    whopAccountStatusAt: Date | null
  } | null = null
  try {
    s = await prisma.clubSettings.findUnique({
      where: { isDefault: true },
      select: {
        whopCompanyId: true,
        whopOnboardingStatus: true,
        whopChargesEnabled: true,
        whopPayoutsEnabled: true,
        whopPayoutMethodId: true,
        whopPayoutCurrency: true,
        whopSweepFrequency: true,
        whopSweepMinAmount: true,
        whopLastSweepAt: true,
        whopAccountStatusAt: true,
      },
    })
  } catch (e) {
    // Este catch convertía CUALQUIER fallo de lectura —club no activo en el
    // AsyncLocalStorage, conexión caída, columna ausente— en «este club no
    // tiene pasarela», que es indistinguible de un club que nunca la conectó.
    // Costó una tarde: la pantalla decía «no está conectada» con la clave
    // guardada en la base de datos. El club en el log es la prueba: si sale
    // vacío, lo que se perdió fue el contexto del club, no la configuración.
    const nombre = e instanceof Error ? e.name : 'error'
    console.error('[whop/config] no se pudo leer la pasarela del club', {
      club: currentTenant()?.slug ?? 'un-solo-club',
      code: (e as { code?: string })?.code ?? nombre,
      // Un error de VALIDACIÓN describe la forma de la consulta (qué campo no
      // reconoce), no las filas: se puede registrar sin exponer datos del club.
      // Cualquier otro error sí puede llevar valores dentro, y se calla.
      detalle:
        nombre === 'PrismaClientValidationError'
          ? String((e as Error).message).replace(/\s+/g, ' ').slice(0, 400)
          : undefined,
    })
    s = null
  }

  const companyId = (s?.whopCompanyId || '').trim()
  const chargesEnabled = Boolean(s?.whopChargesEnabled)
  const payoutMethodId = (s?.whopPayoutMethodId || '').trim()

  return {
    companyId,
    hasCompany: companyId !== '',
    companyIdMasked: mask(companyId),
    onboardingStatus: normalizeStatus(s?.whopOnboardingStatus),
    chargesEnabled,
    payoutsEnabled: Boolean(s?.whopPayoutsEnabled),
    payoutMethodId,
    hasPayoutMethod: payoutMethodId !== '',
    payoutCurrency: (s?.whopPayoutCurrency || 'EUR').toUpperCase(),
    sweepFrequency: normalizeFrequency(s?.whopSweepFrequency),
    sweepMinAmount: typeof s?.whopSweepMinAmount === 'number' ? s.whopSweepMinAmount : 10,
    lastSweepAt: s?.whopLastSweepAt ? s.whopLastSweepAt.toISOString() : null,
    statusAt: s?.whopAccountStatusAt ? s.whopAccountStatusAt.toISOString() : null,
    canCharge: companyId !== '' && chargesEnabled,
  }
}

/**
 * Credencial de la cuenta Whop DEL CLUB activo (API key creada por el CRM).
 * SECRETA: solo para uso en servidor; nunca devolver al cliente.
 */
export async function getWhopClubCredential(): Promise<WhopCredential | null> {
  try {
    const s = await prisma.clubSettings.findUnique({
      where: { isDefault: true },
      select: { whopApiKey: true },
    })
    const guardada = (s?.whopApiKey || '').trim()
    const key = openSecret(guardada)
    // `openSecret` no lanza: devuelve cadena vacía si no hay clave de cifrado o
    // si esta cambió desde que se guardó. Sin esta traza, una credencial
    // ilegible se veía igual que no tener ninguna.
    if (!key && guardada) {
      console.error('[whop/config] credencial guardada ilegible: revisa WHOP_KEY_ENCRYPTION_KEY', {
        club: currentTenant()?.slug ?? 'un-solo-club',
        cifrada: guardada.startsWith('encv1:'),
      })
    }
    return key ? { apiKey: key } : null
  } catch (e) {
    console.error('[whop/config] no se pudo leer la credencial', {
      club: currentTenant()?.slug ?? 'un-solo-club',
      code: (e as { code?: string })?.code ?? (e instanceof Error ? e.name : 'error'),
    })
    return null
  }
}

/**
 * Cuenta de la pasarela del club, distinguiendo "no configurada" de "no se pudo
 * leer": en un-solo-club el webhook la usa para validar el origen del evento, y
 * confundir ambos casos rechazaría cobros reales ante un fallo pasajero de BD.
 */
export async function readWhopClubCompanyId(): Promise<
  { status: 'ok'; value: string } | { status: 'unavailable' }
> {
  try {
    const s = await prisma.clubSettings.findUnique({
      where: { isDefault: true },
      select: { whopCompanyId: true },
    })
    return { status: 'ok', value: (s?.whopCompanyId || '').trim() }
  } catch (e) {
    console.error('[whop] no se pudo leer la cuenta del club', e)
    return { status: 'unavailable' }
  }
}

/** Secret del webhook del club (verificación HMAC). SECRETO. '' si no hay o falla. */
export async function getWhopClubWebhookSecret(): Promise<string> {
  const r = await readWhopClubWebhookSecret()
  return r.status === 'ok' ? r.value : ''
}

/**
 * Igual que el anterior, pero distinguiendo "no configurado" de "no se pudo leer".
 * El webhook lo necesita: un fallo de BD debe responder 503 (reintenta), no 401
 * (que la pasarela interpreta como definitivo y acaba perdiendo el cobro).
 */
export async function readWhopClubWebhookSecret(): Promise<
  { status: 'ok'; value: string } | { status: 'unavailable' }
> {
  try {
    const s = await prisma.clubSettings.findUnique({
      where: { isDefault: true },
      select: { whopWebhookSecret: true },
    })
    return { status: 'ok', value: openSecret((s?.whopWebhookSecret || '').trim()) }
  } catch (e) {
    console.error('[whop] no se pudo leer el secreto del webhook', e)
    return { status: 'unavailable' }
  }
}

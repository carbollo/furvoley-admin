import { whopRequest, WhopError, referralUrl, type WhopCredential } from '@/lib/whop/client'

/**
 * Conexión de la cuenta Whop de un club: validar la API key que pega el admin,
 * resolver su company (biz_…) y comprobar que la key tiene los permisos que el
 * CRM necesita.
 *
 * Módulo de servidor puro (sin 'use server'): maneja la API key del club.
 */

/** URL de alta en Whop con la atribución de partner del dueño del SaaS. */
export function whopSignupUrl(): string {
  const referral = referralUrl()
  if (referral) return referral
  return 'https://whop.com/network/sign-up/'
}

/** Pestaña del dashboard de Whop donde se crean las Account API Keys. */
export function whopApiKeysUrl(): string {
  return (process.env.WHOP_API_KEYS_URL || '').trim() || 'https://whop.com/dashboard/developer'
}

/**
 * Permisos que el CRM necesita de la API key del club, con la acción literal de
 * Whop y para qué se usa (se muestran como checklist en la pantalla de conexión).
 */
export const WHOP_REQUIRED_SCOPES: { action: string; label: string }[] = [
  { action: 'company:basic:read', label: 'Leer los datos de tu cuenta' },
  { action: 'access_pass:create', label: 'Crear los productos de las cuotas' },
  { action: 'plan:create', label: 'Crear los planes de cobro' },
  { action: 'checkout_configuration:create', label: 'Generar los enlaces de pago' },
  { action: 'payment:basic:read', label: 'Leer los pagos de tus socios' },
  { action: 'member:basic:read', label: 'Leer las suscripciones de tus socios' },
  { action: 'developer:manage_webhook', label: 'Recibir avisos de cobro en tiempo real' },
  { action: 'company:balance:read', label: 'Consultar tu saldo' },
  { action: 'payout:account:read', label: 'Ver tu cuenta bancaria' },
  { action: 'payout:destination:read', label: 'Leer tus datos bancarios guardados' },
  { action: 'payout:create_destination', label: 'Guardar tu cuenta bancaria' },
  { action: 'payout:withdraw_funds', label: 'Enviarte el dinero a tu banco' },
]

export type WhopCompanySummary = { id: string; title: string; route: string }

export type ValidateResult =
  | { ok: true; companies: WhopCompanySummary[] }
  | { ok: false; reason: 'invalid_key' | 'no_company' | 'error'; message: string }

type CompaniesResponse = {
  data?: { id?: unknown; title?: unknown; route?: unknown }[]
}

/**
 * Valida la API key pegada por el club y devuelve sus companies.
 *
 * Se usa `GET /companies` (solo pide `company:basic:read`, sin parámetros) en vez
 * de `/accounts/me`, que exigiría además el scope de saldo y haría fallar la
 * validación a keys por lo demás correctas.
 *
 * 401 → key mal pegada o revocada; 403 → key válida sin ese permiso.
 */
export async function validateApiKey(apiKey: string): Promise<ValidateResult> {
  const key = String(apiKey || '').trim()
  if (!key) return { ok: false, reason: 'invalid_key', message: 'Pega la API key de tu cuenta de Whop.' }

  try {
    const res = await whopRequest<CompaniesResponse>({
      path: '/companies',
      credential: { apiKey: key },
      query: { first: 20 },
    })
    const companies: WhopCompanySummary[] = (res?.data || [])
      .map((c) => ({
        id: String(c?.id ?? ''),
        title: String(c?.title ?? ''),
        route: String(c?.route ?? ''),
      }))
      .filter((c) => c.id.startsWith('biz_'))

    if (companies.length === 0) {
      return {
        ok: false,
        reason: 'no_company',
        message:
          'La key es válida pero no hay ninguna cuenta de negocio asociada. Termina el alta en Whop y vuelve a intentarlo.',
      }
    }
    return { ok: true, companies }
  } catch (e) {
    if (e instanceof WhopError && e.status === 401) {
      return {
        ok: false,
        reason: 'invalid_key',
        message: 'Whop no reconoce esa API key. Revisa que la copiaste entera y que no la has revocado.',
      }
    }
    if (e instanceof WhopError && e.status === 403) {
      return {
        ok: false,
        reason: 'error',
        message:
          'La key no tiene permiso para leer tu cuenta. Créala con el rol «Admin» (o marca todos los permisos) y vuelve a pegarla.',
      }
    }
    return {
      ok: false,
      reason: 'error',
      message: 'No se pudo verificar la key con Whop. Inténtalo de nuevo en unos segundos.',
    }
  }
}

/** Eventos que el CRM necesita para mantener la facturación al día. */
const WEBHOOK_EVENTS = [
  'payment.succeeded',
  'payment.failed',
  'membership.went_invalid',
  'membership.deactivated',
]

type WebhookResponse = { id?: unknown; webhook_secret?: unknown }

/**
 * Registra en la cuenta del club el webhook con el que el CRM se entera de los
 * cobros, y devuelve su secreto de firma. Sin esto, un socio podría pagar y el
 * CRM seguiría reclamándole la factura.
 */
export async function registerClubWebhook(
  credential: WhopCredential,
  companyId: string,
  webhookUrl: string,
): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  // Se borran los avisos anteriores a esta misma URL: si no, tras reconectar cada
  // cobro llegaría dos veces y el aviso viejo (con el secreto antiguo) fallaría la
  // firma sin parar hasta que la pasarela desactivara el endpoint.
  try {
    const existing = await whopRequest<{ data?: { id?: unknown; url?: unknown }[] }>({
      path: '/webhooks',
      credential,
      query: { company_id: companyId },
    })
    for (const hook of existing?.data || []) {
      if (String(hook?.url ?? '') !== webhookUrl) continue
      const hookId = String(hook?.id ?? '')
      if (!hookId) continue
      await whopRequest({ method: 'DELETE', path: `/webhooks/${hookId}`, credential }).catch(() => null)
    }
  } catch {
    // Si no se pueden listar, se sigue: es limpieza, no un requisito.
  }

  try {
    const created = await whopRequest<WebhookResponse>({
      method: 'POST',
      path: '/webhooks',
      credential,
      idempotencyKey: `crm:webhook:${companyId}:${webhookUrl}`,
      body: {
        url: webhookUrl,
        events: WEBHOOK_EVENTS,
        resource_id: companyId,
        enabled: true,
      },
    })
    const secret = String(created?.webhook_secret ?? '')
    if (!secret) return { ok: false, error: 'La pasarela no devolvió el secreto del webhook.' }
    return { ok: true, secret }
  } catch (e) {
    if (e instanceof WhopError && e.status === 403) {
      return {
        ok: false,
        error: 'La clave no tiene permiso para crear avisos de cobro. Genera una con el rol «Admin».',
      }
    }
    console.error('[whop/connect] registerClubWebhook', e)
    return { ok: false, error: 'No se pudieron activar los avisos de cobro.' }
  }
}

export type ScopeCheck = { action: string; label: string; granted: boolean }

type PermissionsResponse = { data?: { action?: unknown; granted?: unknown }[] }

/**
 * Comprueba qué permisos de `WHOP_REQUIRED_SCOPES` tiene concedidos la key.
 * `GET /permissions` no exige ningún scope, así que cualquier key válida puede
 * consultarlo: permite decirle al club exactamente qué le falta en vez de que
 * descubra el fallo más tarde con un 403 en mitad de un cobro.
 *
 * Si la consulta falla, se devuelve `null` (no se bloquea la conexión por esto).
 */
export type ScopeCheckResult =
  | { status: 'ok'; scopes: ScopeCheck[] }
  /** La pasarela rechaza la credencial: la key fue revocada o rotada. */
  | { status: 'invalid_key' }
  /** No se pudo comprobar (red, caída): NO significa que la key sea mala. */
  | { status: 'unknown' }

export async function checkScopes(
  credential: WhopCredential,
  companyId: string,
): Promise<ScopeCheckResult> {
  try {
    const res = await whopRequest<PermissionsResponse>({
      path: '/permissions',
      credential,
      query: {
        resource_id: companyId,
        actions: WHOP_REQUIRED_SCOPES.map((s) => s.action).join(','),
      },
    })
    const granted = new Map<string, boolean>()
    for (const row of res?.data || []) {
      granted.set(String(row?.action ?? ''), Boolean(row?.granted))
    }
    return {
      status: 'ok',
      scopes: WHOP_REQUIRED_SCOPES.map((s) => ({
        action: s.action,
        label: s.label,
        granted: granted.get(s.action) ?? false,
      })),
    }
  } catch (e) {
    if (e instanceof WhopError && e.status === 401) return { status: 'invalid_key' }
    return { status: 'unknown' }
  }
}

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
  // Sin este permiso `GET /payouts` responde 403 y el barrido da por «no
  // comprobable» cada transferencia en curso, así que deja de enviar dinero.
  { action: 'payout:withdrawal:read', label: 'Ver tus transferencias ya enviadas' },
]

export type WhopCompanySummary = { id: string; title: string; route: string }

export type ValidateResult =
  | { ok: true; companies: WhopCompanySummary[] }
  /** La clave abre varias cuentas: elige el admin, no el CRM. */
  | { ok: false; reason: 'choose_company'; message: string; companies: WhopCompanySummary[] }
  | { ok: false; reason: 'invalid_key' | 'no_company' | 'error'; message: string }

type CuentaCruda = { id?: unknown; title?: unknown; route?: unknown; parent_account?: unknown }
type ListaCuentas = { data?: CuentaCruda[] }
type CuentaResumen = WhopCompanySummary & { propia: boolean }

function aResumen(filas: CuentaCruda[] | undefined): CuentaResumen[] {
  return (filas || [])
    .map((c) => ({
      id: String(c?.id ?? ''),
      title: String(c?.title ?? ''),
      route: String(c?.route ?? ''),
      // `parent_account` es null en la cuenta propia y trae el padre en las
      // cuentas conectadas de una plataforma. En `/companies` el campo no
      // existe, y `undefined` cuenta igualmente como propia.
      propia: c?.parent_account == null,
    }))
    .filter((c) => c.id.startsWith('biz_'))
}

async function listarCuentas(
  key: string,
  path: '/accounts' | '/companies',
): Promise<{ filas: number; cuentas: CuentaResumen[] }> {
  const res = await whopRequest<ListaCuentas>({
    path,
    credential: { apiKey: key },
    // El máximo documentado de `/accounts` es 50.
    query: { first: path === '/accounts' ? 50 : 20 },
  })
  const data = res?.data || []
  return { filas: data.length, cuentas: aResumen(data) }
}

/** Traduce un fallo de la pasarela, dejando el status en el log del servidor. */
function fallo(e: unknown): ValidateResult {
  const status = e instanceof WhopError ? e.status : 0
  // Solo el status: `WhopError.body` puede traer detalles internos de la pasarela.
  console.error('[whop/connect] validateApiKey', status || (e instanceof Error ? e.name : 'error'))
  if (status === 401) {
    return {
      ok: false,
      reason: 'invalid_key',
      message: 'Whop no reconoce esa API key. Revisa que la copiaste entera y que no la has revocado.',
    }
  }
  if (status === 403) {
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

/**
 * Valida la API key pegada por el club y resuelve su cuenta (`biz_…`).
 *
 * El orden importa y costó un fallo en producción. Antes esto preguntaba por
 * `GET /companies`, que la pasarela documenta como «las companies a las que
 * tiene acceso el usuario actual» — y una API key de cuenta NO es un usuario.
 * La llamada respondía 200 con la lista vacía (la pasarela devuelve menos
 * resultados, no un error, cuando la credencial no alcanza), así que el CRM
 * contestaba «no hay ninguna cuenta asociada, termina el alta» a claves
 * perfectamente correctas y sin dejar una sola línea en los logs.
 *
 * La cascada:
 *  1) `GET /accounts` — la única superficie que la pasarela documenta para
 *     AMBAS credenciales: «los tokens de usuario devuelven sus negocios; las
 *     API keys de cuenta devuelven la cuenta solicitante y sus conectadas».
 *     Además admite autenticación sin ningún permiso concreto.
 *  2) `GET /companies` — red de seguridad para tokens de usuario.
 *
 * No se usa `/accounts/me`: exige el permiso de saldo, así que rechazaría
 * claves por lo demás correctas, y no cubre los tokens de usuario.
 *
 * Un 401 corta la cascada (la clave no vale). Un 403 o una lista vacía NO
 * descalifican nada: se prueba la otra superficie antes de rendirse.
 */
export async function validateApiKey(apiKey: string): Promise<ValidateResult> {
  const key = String(apiKey || '').trim()
  if (!key) return { ok: false, reason: 'invalid_key', message: 'Pega la API key de tu cuenta de Whop.' }

  let superficie: '/accounts' | '/companies' = '/accounts'
  let filas = 0
  let cuentas: CuentaResumen[] = []
  let primerError: unknown = null

  try {
    const r = await listarCuentas(key, '/accounts')
    filas = r.filas
    cuentas = r.cuentas
  } catch (e) {
    if (e instanceof WhopError && e.status === 401) return fallo(e)
    primerError = e
    console.warn('[whop/connect] /accounts no resolvió', e instanceof WhopError ? e.status : 'error')
  }

  if (cuentas.length === 0) {
    superficie = '/companies'
    try {
      const r = await listarCuentas(key, '/companies')
      filas = r.filas
      cuentas = r.cuentas
    } catch (e) {
      return fallo(primerError ?? e)
    }
  }

  if (cuentas.length === 0) {
    // `filas` es la señal que hace falta para diagnosticar sin ver la clave:
    // 0 = la pasarela no devolvió ninguna fila (alcance de la credencial);
    // >0 = devolvió filas y ninguna tenía un id de cuenta de negocio.
    console.warn('[whop/connect] validateApiKey sin cuentas', {
      superficie,
      filas,
      conBiz: 0,
      largoClave: key.length,
    })
    return {
      ok: false,
      reason: 'no_company',
      message:
        'Whop ha aceptado la clave, pero no ha devuelto ninguna cuenta de negocio asociada a ella. Si tu alta en Whop ya está terminada, no es cosa tuya: avisa al proveedor del CRM con la fecha y la hora exacta de este intento.',
    }
  }

  // Una clave de plataforma trae también las cuentas conectadas. La propia es la
  // que no tiene cuenta padre. Si aun así quedan varias, NO se elige por el
  // admin: acertar es reservar la cuenta correcta, y fallar es conectar el CRM
  // a una cuenta ajena y borrar de paso los planes y enlaces de pago del club.
  const propias = cuentas.filter((c) => c.propia)
  const candidatas = propias.length > 0 ? propias : cuentas
  const companies: WhopCompanySummary[] = candidatas.map(({ id, title, route }) => ({ id, title, route }))

  if (companies.length > 1) {
    console.warn('[whop/connect] validateApiKey con varias cuentas', {
      superficie,
      filas,
      conBiz: cuentas.length,
      propias: propias.length,
    })
    return {
      ok: false,
      reason: 'choose_company',
      message: 'Esa clave da acceso a varias cuentas. Elige con cuál quieres cobrar.',
      companies,
    }
  }

  return { ok: true, companies }
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
  // Primero se crea y después se limpia. Al revés —como estaba— un fallo del
  // alta dejaba al club sin ningún aviso de cobro: se habría borrado el que
  // funcionaba antes de tener el nuevo.
  let creado: WebhookResponse
  try {
    creado = await whopRequest<WebhookResponse>({
      method: 'POST',
      path: '/webhooks',
      credential,
      idempotencyKey: `crm:webhook:${companyId}:${webhookUrl}`,
      body: {
        url: webhookUrl,
        events: WEBHOOK_EVENTS,
        // Explícito a propósito: la pasarela lo deja por defecto en «la cuenta
        // actual», y esa ambigüedad de identidad es justo la que rompió la
        // conexión de las claves de cuenta.
        resource_id: companyId,
        enabled: true,
      },
    })
  } catch (e) {
    if (e instanceof WhopError && e.status === 403) {
      return {
        ok: false,
        error: 'La clave no tiene permiso para crear avisos de cobro. Genera una con el rol «Admin».',
      }
    }
    console.error('[whop/connect] registerClubWebhook', e instanceof WhopError ? e.status : 'error')
    return { ok: false, error: 'No se pudieron activar los avisos de cobro.' }
  }

  const secret = String(creado?.webhook_secret ?? '')
  const creadoId = String(creado?.id ?? '')
  if (!secret) return { ok: false, error: 'La pasarela no devolvió el secreto del webhook.' }

  // Avisos anteriores a esta misma URL: si sobreviven, tras reconectar cada cobro
  // llegaría dos veces y el viejo —con el secreto antiguo— fallaría la firma sin
  // parar hasta que la pasarela desactivara el endpoint.
  //
  // Esto NUNCA llegó a borrar nada: se listaba con `company_id`, un parámetro que
  // no existe; el obligatorio se llama `account_id`, y el `catch` mudo se tragaba
  // el error. Ahora al menos deja rastro.
  try {
    const previos = await whopRequest<{ data?: { id?: unknown; url?: unknown }[] }>({
      path: '/webhooks',
      credential,
      query: { account_id: companyId, first: 100 },
    })
    for (const hook of previos?.data || []) {
      if (String(hook?.url ?? '') !== webhookUrl) continue
      const hookId = String(hook?.id ?? '')
      if (!hookId || hookId === creadoId) continue
      await whopRequest({ method: 'DELETE', path: `/webhooks/${hookId}`, credential }).catch(() => null)
    }
  } catch (e) {
    // Sigue siendo limpieza, no un requisito: no se aborta la conexión por esto.
    console.warn(
      '[whop/connect] no se pudieron listar avisos previos',
      e instanceof WhopError ? e.status : 'error',
    )
  }

  return { ok: true, secret }
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

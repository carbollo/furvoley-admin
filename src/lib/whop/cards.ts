import { createHash } from 'node:crypto'
import { currentTenant } from '@/lib/multitenant/context'
import { cache } from 'react'
import { whopRequest, WhopError } from '@/lib/whop/client'
import { getWhopClubConfig, getWhopClubCredential } from '@/lib/whop/club-config'

/**
 * Tarjetas del club en la pasarela.
 *
 * El club gasta su propio saldo con una tarjeta Visa en vez de esperar a que se
 * lo transfieran al banco. Desde el CRM se ven, se emiten, se congelan, se
 * cancelan, se les pone límite y se mira en qué se ha gastado.
 *
 * Dos cosas que hay que tener presentes SIEMPRE en este fichero:
 *
 * 1. La tarjeta liquida en DÓLARES (`usd_amount`, límites «in dollars»), pero el
 *    club lleva euros. Aquí no se convierte nada ni se inventa un tipo de
 *    cambio: se devuelven las dos cifras que da la pasarela —lo que cobró el
 *    comercio en su divisa y lo que se descontó en USD— y que las lea quien
 *    sabe cuál necesita.
 * 2. `GET /cards/:id` devuelve el NÚMERO COMPLETO y el CVC. Eso no se guarda en
 *    la base de datos, no entra en ningún log y no se mezcla con el resto de la
 *    respuesta: sale solo por `getCardSecrets`, que descarta todo lo demás.
 *
 * Módulo de servidor puro (sin 'use server'): mueve dinero.
 */

/** Permisos que la clave necesita ADEMÁS de los del cobro normal. */
export const WHOP_CARD_SCOPES: { action: string; label: string }[] = [
  { action: 'payout:account:update', label: 'Emitir y gestionar tarjetas' },
  { action: 'company:authorized_user:read', label: 'Ver quién puede llevar una tarjeta' },
]

export type CardStatus = 'active' | 'frozen' | 'canceled' | 'invited' | 'denied' | 'unknown'

export type ClubCard = {
  id: string
  name: string
  /** `null` mientras la tarjeta es solo una invitación sin aceptar. */
  last4: string | null
  status: CardStatus
  type: 'virtual' | 'physical' | 'unknown'
  /** Límite de gasto en dólares, o `null` si no tiene. */
  limitAmount: number | null
  limitFrequency: 'daily' | 'weekly' | 'monthly' | 'one_time' | 'per_transaction' | null
  /** Gastado en los últimos 30 días, en dólares. */
  spentLastMonth: number
  expiration: string | null
  /** Usuario de la pasarela que la lleva. */
  userId: string | null
  createdAt: string | null
  canceledAt: string | null
}

export type CardMovement = {
  id: string
  cardId: string
  date: string
  /** Lo que cobró el comercio, en su propia divisa. */
  localAmount: number | null
  localCurrency: string | null
  /** Lo que se descontó de la tarjeta. Negativo si fue una devolución, `null` si la pasarela aún no lo ha calculado. */
  usdAmount: number | null
  status: 'pending' | 'completed' | 'reversed' | 'declined' | 'unknown'
  merchant: string
  merchantIconUrl: string | null
  category: string | null
  /** Solo cuando `status` es `declined`: por qué no pasó. */
  declinedReason: string | null
  international: boolean
}

export type CardHolder = { userId: string; name: string; role: string; pending: boolean }

type Ctx = { companyId: string; credential: { apiKey: string } }

const ctx = cache(async function ctx(): Promise<{ ok: true; ctx: Ctx } | { ok: false; error: string }> {
  const config = await getWhopClubConfig()
  if (!config.hasCompany) {
    console.error('[whop/cards] sin cuenta conectada', {
      club: currentTenant()?.slug ?? 'un-solo-club',
      onboarding: config.onboardingStatus,
    })
    return { ok: false, error: 'La pasarela de cobro no está conectada. Configúrala en Ajustes del club.' }
  }
  const credential = await getWhopClubCredential()
  if (!credential) {
    return { ok: false, error: 'Falta la clave de la pasarela. Vuelve a conectarla en Ajustes del club.' }
  }
  return { ok: true, ctx: { companyId: config.companyId, credential } }
})

/**
 * Traduce el fallo a algo accionable, sin reenviar nunca el texto crudo de la
 * pasarela: va en inglés y puede repetir dentro el dato que rechazó.
 */
function friendly(e: unknown, fallback: string, op?: 'listar' | 'emitir' | 'tarjeta'): string {
  if (!(e instanceof WhopError)) return fallback
  const raw = String(e.message || '')

  if (e.status === 401) return 'La clave de la pasarela ya no es válida. Vuelve a conectarla en Ajustes del club.'
  // Cada codigo significa una cosa distinta EN CADA endpoint, y traducirlos a
  // todos igual manda al club a arreglar algo que no esta roto: decirle que le
  // falta el permiso de emitir cuando lo que le falta es el de leer, o que su
  // tarjeta «no se encuentra» cuando lo que pasa es que aun no tiene cuenta.
  if (e.status === 403) {
    return op === 'listar'
      ? 'La clave de la pasarela no tiene permiso para ver las tarjetas. Genera una nueva con «Ver tu cuenta bancaria» marcado.'
      : 'La clave de la pasarela no tiene permiso para gestionar tarjetas. Genera una nueva añadiendo «Emitir y gestionar tarjetas».'
  }
  if (e.status === 404) {
    return op === 'tarjeta'
      ? 'La pasarela no encuentra esa tarjeta. Actualiza la lista.'
      : 'La pasarela todavía no tiene una cuenta de saldo para este club, así que no puede haber tarjetas.'
  }
  if (e.status === 409) {
    // Al emitir: la solicitud de tarjetas del club no esta aprobada.
    // Al modificar: el emisor ha rechazado a la persona a la que se invito.
    return op === 'emitir'
      ? 'La pasarela aún no ha aprobado a este club para tener tarjetas. Hasta que no termine esa revisión no se puede emitir ninguna.'
      : op === 'tarjeta'
        ? 'El emisor ha rechazado a la persona a la que se invitó esta tarjeta, así que no se puede seguir con ella.'
        : 'Esa misma operación ya se está procesando. Actualiza en unos segundos.'
  }

  if (/not eligible|ineligible|not available|unsupported country|region/i.test(raw)) {
    return 'La pasarela no ofrece tarjetas a esta cuenta todavía. Escríbeles para saber si tu país está disponible.'
  }
  if (/kyc|verification|verify|identity/i.test(raw)) {
    return 'La pasarela necesita verificar la identidad del titular antes de emitir la tarjeta.'
  }
  if (/insufficient|not enough|balance/i.test(raw)) {
    return 'No hay saldo suficiente para respaldar esa tarjeta.'
  }
  if (/limit/i.test(raw)) return 'El límite que has puesto no lo admite la pasarela. Prueba con otro importe.'
  if (/canceled|cancelled/i.test(raw)) return 'Esa tarjeta ya está cancelada. Una cancelación no se puede deshacer.'
  if (/invalid|validation|format/i.test(raw)) return 'Alguno de los datos no tiene el formato correcto. Revísalos.'
  return fallback
}

/**
 * Log sin datos de tarjeta.
 *
 * `WhopError` lleva el cuerpo de la respuesta como propiedad propia; en este
 * módulo ese cuerpo puede contener el número completo de la tarjeta. Solo se
 * registra el status.
 */
/**
 * Tipo y código del error que devuelve la pasarela. Es lo que dice QUÉ ha
 * rechazado; sin ello un 400 no se distingue de otro. Deliberadamente NO se
 * registra el texto libre ni el cuerpo entero: pueden repetir dentro el propio
 * dato que causó el fallo (un IBAN, un número de tarjeta).
 */
function motivo(e: unknown): string {
  const err = e instanceof WhopError ? (e.body as { error?: { type?: string; code?: string } })?.error : null
  return [err?.type, err?.code].filter(Boolean).join('/')
}

function logSafe(op: string, e: unknown): void {
  if (e instanceof WhopError) {
    console.error(`[whop/cards] ${op} status=${e.status}`, motivo(e))
    return
  }
  // Para lo que no viene de la pasarela, el `code` es lo que separa un fallo
  // de red de una tabla o una columna que faltan.
  console.error(`[whop/cards] ${op}`, {
    name: e instanceof Error ? e.name : 'error',
    code: (e as { code?: string })?.code ?? '',
  })
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim())
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s ? s : null
}

const ESTADOS: CardStatus[] = ['active', 'frozen', 'canceled', 'invited', 'denied']

function mapCard(raw: Record<string, unknown>): ClubCard {
  const limit = (raw.limit || null) as Record<string, unknown> | null
  const estado = String(raw.status || '').toLowerCase() as CardStatus
  const tipo = String(raw.type || '').toLowerCase()
  const mes = raw.spent_last_month
  return {
    id: String(raw.id || ''),
    name: str(raw.name) || 'Tarjeta del club',
    last4: str(raw.last4),
    status: ESTADOS.includes(estado) ? estado : 'unknown',
    type: tipo === 'virtual' || tipo === 'physical' ? tipo : 'unknown',
    limitAmount: limit && limit.amount != null ? num(limit.amount) : null,
    limitFrequency: (str(limit?.frequency) as ClubCard['limitFrequency']) || null,
    // La pasarela da este dato en CÉNTIMOS mientras que el límite lo da en
    // dólares. Se normaliza aquí para que nadie compare 5000 con 50 más abajo.
    spentLastMonth: mes == null ? 0 : num(mes) / 100,
    expiration:
      raw.expiration_month && raw.expiration_year
        ? `${String(raw.expiration_month).padStart(2, '0')}/${String(raw.expiration_year).slice(-2)}`
        : null,
    userId: str(raw.user_id),
    createdAt: str(raw.created_at),
    canceledAt: str(raw.canceled_at),
  }
}

/**
 * Qué permisos de tarjeta tiene concedidos la clave del club.
 *
 * `GET /permissions` no exige ningún scope, así que se puede preguntar siempre.
 * Se consulta por adelantado para poder desactivar los botones con una
 * explicación, en vez de dejar que el club rellene un formulario y se coma un
 * «no autorizado» al final.
 */
export async function checkCardScopes(): Promise<{ action: string; label: string; granted: boolean }[]> {
  const c = await ctx()
  // Sin contexto no se ha llegado a preguntar nada, así que no se puede
  // afirmar que falten permisos: hacerlo culpaba a la clave del club de un
  // fallo nuestro, y le pedía generar otra que no habría arreglado nada.
  if (!c.ok) {
    console.error('[whop/cards] checkCardScopes sin contexto', {
      club: currentTenant()?.slug ?? 'un-solo-club',
    })
    return WHOP_CARD_SCOPES.map((s) => ({ ...s, granted: true }))
  }
  try {
    const res = await whopRequest<{ data?: { action?: unknown; granted?: unknown }[] }>({
      path: '/permissions',
      credential: c.ctx.credential,
      query: {
        resource_id: c.ctx.companyId,
        actions: WHOP_CARD_SCOPES.map((s) => s.action).join(','),
      },
    })
    const granted = new Map<string, boolean>()
    for (const row of res?.data || []) granted.set(String(row?.action ?? ''), Boolean(row?.granted))
    return WHOP_CARD_SCOPES.map((s) => ({ ...s, granted: granted.get(s.action) ?? false }))
  } catch (e) {
    logSafe('checkCardScopes', e)
    // No se pudo comprobar: se asume concedido para no bloquear al club por una
    // caída de red. Si de verdad falta, la operación fallará con un 403 legible.
    return WHOP_CARD_SCOPES.map((s) => ({ ...s, granted: true }))
  }
}

export async function listCards(): Promise<
  { ok: true; cards: ClubCard[] } | { ok: false; error: string }
> {
  const c = await ctx()
  if (!c.ok) return c
  try {
    const res = await whopRequest<{ data?: Record<string, unknown>[] }>({
      path: '/cards',
      credential: c.ctx.credential,
      query: { account_id: c.ctx.companyId },
    })
    const cards = (res?.data || []).map(mapCard).filter((t) => t.id)
    // Las canceladas al final: siguen contando para el histórico de gastos pero
    // ya no son una tarjeta que el club pueda usar.
    cards.sort((a, b) => Number(a.status === 'canceled') - Number(b.status === 'canceled'))
    return { ok: true, cards }
  } catch (e) {
    logSafe('listCards', e)
    return { ok: false, error: friendly(e, 'No se pudieron consultar las tarjetas.', 'listar') }
  }
}

/**
 * Número completo y CVC de una tarjeta.
 *
 * Devuelve SOLO los secretos: el resto de la respuesta se descarta a propósito,
 * para que este dato no pueda colarse por accidente en una respuesta que se
 * cachee, se registre o se guarde. Quien llama tiene que tratarlo como algo de
 * un solo uso.
 */
export async function getCardSecrets(
  cardId: string,
): Promise<
  | { ok: true; cardNumber: string; cvc: string; nameOnCard: string | null; expiration: string | null }
  | { ok: false; error: string }
> {
  const c = await ctx()
  if (!c.ok) return c
  if (!/^icrd_[A-Za-z0-9]+$/.test(cardId)) return { ok: false, error: 'Tarjeta no válida.' }
  try {
    const res = await whopRequest<Record<string, unknown>>({
      path: `/cards/${encodeURIComponent(cardId)}`,
      credential: c.ctx.credential,
      query: { account_id: c.ctx.companyId },
    })
    const secrets = (res?.secrets || null) as Record<string, unknown> | null
    const numero = str(secrets?.card_number)
    if (!numero) {
      return {
        ok: false,
        error:
          'La pasarela no da los datos de esta tarjeta. Solo los devuelve mientras la tarjeta está activa.',
      }
    }
    return {
      ok: true,
      cardNumber: numero,
      cvc: str(secrets?.cvc) || '',
      nameOnCard: str(secrets?.name_on_card),
      expiration:
        res.expiration_month && res.expiration_year
          ? `${String(res.expiration_month).padStart(2, '0')}/${String(res.expiration_year).slice(-2)}`
          : null,
    }
  } catch (e) {
    logSafe('getCardSecrets', e)
    return { ok: false, error: friendly(e, 'No se pudieron consultar los datos de la tarjeta.') }
  }
}

export type CreateCardResult =
  /** Emitida y lista para usar. */
  | { ok: true; kind: 'card'; card: ClubCard }
  /** La pasarela la está fabricando; aparecerá en la lista en unos segundos. */
  | { ok: true; kind: 'provisioning' }
  /** Se ha invitado al titular: hasta que no complete su alta no hay tarjeta. */
  | { ok: true; kind: 'invitation' }
  /**
   * La pasarela no ha aprobado todavía a este club para tener tarjetas y ha
   * abierto una solicitud. `hostedUrl` es la ÚNICA forma de completarla: si se
   * pierde, el club se queda esperando una tarjeta que no llegará nunca.
   */
  | { ok: true; kind: 'application'; applicationStatus: string; hostedUrl: string | null }
  /**
   * `indeterminate` significa que puede haberse emitido igualmente (se agotó el
   * tiempo, o la pasarela falló después de recibir la petición). Quien llame
   * tiene que refrescar la lista antes de dejar reintentar.
   */
  | { ok: false; error: string; indeterminate: boolean }

/**
 * Emite una tarjeta.
 *
 * La clave de idempotencia se deriva de `requestId` —un identificador que crea
 * el navegador para ESTE intento— combinado con el contenido enviado:
 *
 * - Doble clic: mismo `requestId` y mismo contenido, misma clave. La pasarela
 *   devuelve la tarjeta que ya creó en vez de emitir dos.
 * - El club corrige el formulario y reintenta: cambia el contenido, cambia la
 *   clave. Sin esto se comería un 400 por «misma clave, cuerpo distinto».
 * - El intento falla y el club vuelve a probar: el navegador genera otro
 *   `requestId`. Importa porque la pasarela también repite las respuestas de
 *   ERROR durante 24 h; sin renovarlo, el club se quedaría atrapado un día
 *   entero viendo el mismo fallo.
 *
 * Antes esto se derivaba de «cuántas tarjetas hay». Era un error: al cancelar
 * una tarjeta el recuento volvía atrás, así que reemitir la misma tarjeta
 * después de cancelarla —justo lo que hay que hacer si te la clonan— repetía la
 * clave y la pasarela devolvía la tarjeta cancelada sin emitir ninguna nueva.
 */
export async function createCard(input: {
  name: string
  spendLimit?: number | null
  spendLimitFrequency?: 'daily' | 'weekly' | 'monthly' | 'one_time'
  transactionLimit?: number | null
  assignedUserId?: string | null
  /** Identificador de este intento, creado por el navegador. */
  requestId: string
}): Promise<CreateCardResult> {
  const c = await ctx()
  if (!c.ok) return { ok: false, error: c.error, indeterminate: false }

  const name = Array.from(input.name.trim()).slice(0, 60).join('')
  if (!name) return { ok: false, error: 'Ponle un nombre a la tarjeta.', indeterminate: false }

  const body: Record<string, unknown> = { account_id: c.ctx.companyId, name }
  if (input.assignedUserId) body.assigned_user_id = input.assignedUserId
  if (input.spendLimit != null && input.spendLimit > 0) {
    body.spend_limit = Number(input.spendLimit.toFixed(2))
    body.spend_limit_frequency = input.spendLimitFrequency || 'monthly'
  }
  if (input.transactionLimit != null && input.transactionLimit > 0) {
    body.transaction_limit = Number(input.transactionLimit.toFixed(2))
  }

  // JSON y no «clave=valor» unidos por &: un nombre de tarjeta que contuviera
  // «&spend_limit=» podria fabricar la misma cadena canonica que otra peticion
  // distinta, y la pasarela le devolveria una respuesta ajena.
  const canonical = JSON.stringify([input.requestId, Object.keys(body).sort().map((k) => [k, body[k]])])
  const idempotencyKey = `crm:card:${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`

  try {
    const res = await whopRequest<Record<string, unknown>>({
      method: 'POST',
      path: '/cards',
      credential: c.ctx.credential,
      idempotencyKey,
      body,
    })
    // Siempre por `object`: el contrato tiene CUATRO formas y tres de ellas
    // traen `id`, así que fiarse de que exista un id confundía una solicitud de
    // verificación (`ciac_…`) con una tarjeta emitida (`icrd_…`).
    const object = String(res?.object || '')
    if (object === 'card_invitation') return { ok: true, kind: 'invitation' }
    if (object === 'card_provisioning') return { ok: true, kind: 'provisioning' }
    if (object === 'card_application') {
      return {
        ok: true,
        kind: 'application',
        applicationStatus: String(res?.status || 'pending'),
        hostedUrl: str(res?.hosted_url),
      }
    }
    if (object === 'card' && typeof res?.id === 'string' && /^icrd_/.test(res.id)) {
      return { ok: true, kind: 'card', card: mapCard(res) }
    }
    // Forma desconocida: no se afirma que exista una tarjeta, pero tampoco que
    // no. Que el club mire la lista.
    return { ok: true, kind: 'provisioning' }
  } catch (e) {
    logSafe('createCard', e)
    // Un corte o un 5xx puede haber dejado la tarjeta creada al otro lado. Solo
    // un rechazo explícito (4xx que no sea 409) garantiza que no se emitió.
    const status = e instanceof WhopError ? e.status : 0
    // Un 4xx es un rechazo firme: no se creo nada. El 409 de ESTE endpoint
    // significa «la solicitud del club no esta aprobada», que tambien es firme
    // (a diferencia del 409 de las transferencias, que si es «ya en curso»).
    const indeterminate = !(status >= 400 && status < 500)
    return { ok: false, error: friendly(e, 'No se pudo emitir la tarjeta.', 'emitir'), indeterminate }
  }
}

/**
 * Congela, descongela, cancela, renombra o cambia el límite.
 *
 * `canceled` no se combina con nada más porque la pasarela lo rechaza, y porque
 * cancelar es irreversible: mezclarlo con un cambio de nombre invitaría a
 * hacerlo sin querer.
 */
export async function updateCard(
  cardId: string,
  patch: {
    frozen?: boolean
    canceled?: boolean
    name?: string
    spendLimit?: number | null
    spendLimitFrequency?: 'daily' | 'weekly' | 'monthly' | 'one_time'
    /** Tope por compra. Es lo que la pasarela llama límite `per_transaction`. */
    transactionLimit?: number | null
    removeLimit?: boolean
  },
): Promise<{ ok: true; card: ClubCard } | { ok: false; error: string; indeterminate: boolean }> {
  const c = await ctx()
  if (!c.ok) return { ok: false, error: c.error, indeterminate: false }
  if (!/^icrd_[A-Za-z0-9]+$/.test(cardId)) {
    return { ok: false, error: 'Tarjeta no válida.', indeterminate: false }
  }

  const body: Record<string, unknown> = { account_id: c.ctx.companyId }
  // Los dos topes son excluyentes: mandarlos juntos haria que uno se perdiera en
  // silencio y la tarjeta acabase con un limite que el club no ha pedido. Mejor
  // rechazarlo que elegir por el.
  if (patch.spendLimit != null && patch.transactionLimit != null) {
    return { ok: false, error: 'Elige un solo tipo de límite: por periodo o por compra.', indeterminate: false }
  }
  if (patch.canceled === true) {
    body.canceled = true
  } else {
    if (patch.frozen !== undefined) body.frozen = patch.frozen
    if (patch.name !== undefined) {
      const n = Array.from(patch.name.trim()).slice(0, 60).join('')
      if (!n) return { ok: false, error: 'El nombre no puede quedarse vacío.', indeterminate: false }
      body.name = n
    }
    if (patch.removeLimit) {
      body.remove_limit = true
    } else if (patch.transactionLimit != null) {
      // Un tope por compra no se expresa con `spend_limit_frequency`: la
      // pasarela lo declara aparte y luego lo reporta como `per_transaction`.
      if (!(patch.transactionLimit > 0)) {
        return { ok: false, error: 'El límite tiene que ser mayor que cero.', indeterminate: false }
      }
      body.transaction_limit = Number(patch.transactionLimit.toFixed(2))
    } else if (patch.spendLimit != null) {
      if (!(patch.spendLimit > 0)) {
        return { ok: false, error: 'El límite tiene que ser mayor que cero.', indeterminate: false }
      }
      body.spend_limit = Number(patch.spendLimit.toFixed(2))
      // Sin periodo explícito no se toca el límite: cambiarlo a «al mes» por
      // defecto convertiría un tope diario en uno mensual sin decir nada.
      if (!patch.spendLimitFrequency) {
        return { ok: false, error: 'Falta indicar cada cuánto se aplica el límite.', indeterminate: false }
      }
      body.spend_limit_frequency = patch.spendLimitFrequency
    }
  }

  if (Object.keys(body).length === 1) {
    return { ok: false, error: 'Nada que cambiar.', indeterminate: false }
  }

  try {
    const res = await whopRequest<Record<string, unknown>>({
      method: 'PATCH',
      path: `/cards/${encodeURIComponent(cardId)}`,
      credential: c.ctx.credential,
      body,
    })
    // Una respuesta sin tarjeta dentro no se da por buena, pero tampoco por
    // fallida: el cambio puede haberse aplicado igual.
    if (!res || typeof res !== 'object' || !res.id) {
      return { ok: false, error: 'La pasarela no confirmó el cambio. Actualiza la lista.', indeterminate: true }
    }
    return { ok: true, card: mapCard(res) }
  } catch (e) {
    logSafe('updateCard', e)
    // Importa sobre todo al CANCELAR: si se corta la conexion, decirle al club
    // que «no se pudo» cuando puede haberse cancelado —y no tiene vuelta atras—
    // es peor que reconocer que no se sabe.
    const status = e instanceof WhopError ? e.status : 0
    return {
      ok: false,
      error: friendly(e, 'No se pudo cambiar la tarjeta.', 'tarjeta'),
      indeterminate: !(status >= 400 && status < 500),
    }
  }
}

const ESTADOS_MOV = ['pending', 'completed', 'reversed', 'declined'] as const

export async function listCardMovements(opts?: {
  cardId?: string
  limit?: number
}): Promise<{ ok: true; movements: CardMovement[]; hayMas: boolean } | { ok: false; error: string }> {
  const c = await ctx()
  if (!c.ok) return c
  try {
    const res = await whopRequest<{ data?: Record<string, unknown>[]; page_info?: unknown }>({
      path: '/card_transactions',
      credential: c.ctx.credential,
      query: {
        account_id: c.ctx.companyId,
        card_id: opts?.cardId || undefined,
        order: 'created_at',
        direction: 'desc',
        first: Math.min(Math.max(opts?.limit || 25, 1), 100),
      },
    })
    // `page_info` dice si hay mas paginas. No se recorren: la pantalla ensena los
    // ultimos movimientos, no el historico. Se devuelve el dato para que la
    // pantalla pueda decir que esta viendo solo un trozo.
    const hayMas = Boolean((res?.page_info as { has_next_page?: unknown } | undefined)?.has_next_page)
    const movements = (res?.data || []).map((m): CardMovement => {
      const estado = String(m.status || '').toLowerCase()
      return {
        id: String(m.id || ''),
        cardId: String(m.card_id || ''),
        date: String(m.created_at || ''),
        localAmount: m.local_amount == null ? null : num(m.local_amount),
        localCurrency: str(m.currency)?.toUpperCase() || null,
        usdAmount: m.usd_amount == null ? null : num(m.usd_amount),
        status: (ESTADOS_MOV as readonly string[]).includes(estado)
          ? (estado as CardMovement['status'])
          : 'unknown',
        merchant: str(m.merchant_name) || 'Comercio sin identificar',
        merchantIconUrl: str(m.merchant_icon_url),
        category: str(m.merchant_category),
        declinedReason: estado === 'declined' ? str(m.declined_reason) : null,
        international: Boolean(m.international),
      }
    })
    return { ok: true, movements: movements.filter((m) => m.id), hayMas }
  } catch (e) {
    logSafe('listCardMovements', e)
    return { ok: false, error: friendly(e, 'No se pudieron consultar los gastos de la tarjeta.', 'listar') }
  }
}

/**
 * Quién puede llevar una tarjeta.
 *
 * La pasarela exige asignar cada tarjeta de empresa a una persona del equipo, y
 * solo acepta identificadores que ya estén dados de alta en la cuenta: por eso
 * se ofrece una lista y no un campo de texto libre.
 */
export async function listCardHolders(): Promise<
  { ok: true; holders: CardHolder[] } | { ok: false; error: string }
> {
  const c = await ctx()
  if (!c.ok) return c
  try {
    const res = await whopRequest<{ data?: Record<string, unknown>[] }>({
      path: '/team_members',
      credential: c.ctx.credential,
      query: { account_id: c.ctx.companyId, first: 100 },
    })
    const holders: CardHolder[] = []
    for (const row of res?.data || []) {
      const user = (row.user || null) as Record<string, unknown> | null
      const userId = str(user?.id)
      // Sin usuario detrás es una invitación por correo que aún no ha aceptado
      // nadie: no hay a quién asignarle la tarjeta.
      if (!userId) continue
      holders.push({
        userId,
        name: str(user?.name) || str(user?.username) || str(row.email) || userId,
        role: str(row.role) || 'member',
        pending: String(row.status || '') === 'pending',
      })
    }
    return { ok: true, holders }
  } catch (e) {
    logSafe('listCardHolders', e)
    return { ok: false, error: friendly(e, 'No se pudo consultar quién puede llevar una tarjeta.') }
  }
}

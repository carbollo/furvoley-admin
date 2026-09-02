import { createHash } from 'node:crypto'
import { ejemploCampo, esCripto, etiquetaCampo, nombreMetodo } from '@/lib/whop/traducciones'
import { currentTenant } from '@/lib/multitenant/context'
import { prisma } from '@/lib/prisma'
import { whopRequest, WhopError } from '@/lib/whop/client'
import { getWhopClubConfig, getWhopClubCredential } from '@/lib/whop/club-config'

/**
 * Cuenta bancaria del club y transferencias de su saldo.
 *
 * El club no entra en la pasarela: el CRM le pregunta a la pasarela qué datos
 * bancarios hacen falta en su país, los pinta como formulario, los guarda, y
 * luego le transfiere el saldo automáticamente.
 *
 * Módulo de servidor puro (sin 'use server'): mueve dinero.
 */

export type PayoutField = {
  id: string
  label: string
  inputType: 'text' | 'options' | 'date'
  placeholder: string
  options: string[]
  /** Si es opcional, no bloquea el guardado. */
  required: boolean
  /** Dato bancario delicado (IBAN, nº de cuenta): se pinta enmascarado. */
  sensitive: boolean
  /** Expresión que debe cumplir el valor, para avisar antes de enviarlo. */
  validation: string | null
}

export type SupportedMethod = {
  id: string
  name: string
  deliveryType: string
  supportsInstant: boolean
  requiredFields: PayoutField[]
}

export type SavedPayoutMethod = {
  id: string
  nickname: string
  institution: string
  /** Identificador enmascarado (p. ej. los últimos dígitos de la cuenta). */
  reference: string
  /** Divisa en la que esta cuenta recibe el dinero. */
  currency: string
  isDefault: boolean
  /** created (guardada) | active (ya cobró) | broken (falló y hay que revisarla). */
  status: string
  /** checking | verified | no_data | warning | broken */
  verification: string | null
  /** Motivo por el que la pasarela la ha dejado inutilizable, si lo hay. */
  unavailableReason: string | null
}

export type Balance = {
  currency: string
  /** Lo que se puede transferir ahora mismo. */
  available: number
  /** Cobros recientes que aún están liquidando. */
  pending: number
  /** Retenido por la pasarela (garantía, revisiones). */
  reserve: number
}

type Ctx = {
  companyId: string
  credential: { apiKey: string }
  /** Divisa en la que el club cobra. Decide qué datos bancarios se piden. */
  payoutCurrency: string
}

async function ctx(): Promise<{ ok: true; ctx: Ctx } | { ok: false; error: string }> {
  const config = await getWhopClubConfig()
  if (!config.hasCompany) {
    // Si esta línea sale con la clave guardada en la base de datos, lo que falta
    // no es la pasarela: es el club activo en el contexto de la petición.
    console.error('[whop/payouts] sin cuenta conectada', {
      club: currentTenant()?.slug ?? 'un-solo-club',
      onboarding: config.onboardingStatus,
    })
    return { ok: false, error: 'La pasarela de cobro no está conectada. Configúrala en Ajustes del club.' }
  }
  const credential = await getWhopClubCredential()
  if (!credential) {
    return { ok: false, error: 'Falta la clave de la pasarela. Vuelve a conectarla en Ajustes del club.' }
  }
  return {
    ok: true,
    ctx: { companyId: config.companyId, credential, payoutCurrency: config.payoutCurrency },
  }
}

/**
 * Traduce el fallo de la pasarela a algo que el club pueda leer y accionar.
 *
 * Nunca se reenvía el texto crudo: los mensajes de la pasarela van en inglés y
 * pueden llevar dentro el propio dato bancario que causó el error.
 */
function friendly(e: unknown, fallback: string): string {
  if (!(e instanceof WhopError)) return fallback
  const raw = String(e.message || '')

  if (e.status === 401) return 'La clave de la pasarela ya no es válida. Vuelve a conectarla en Ajustes del club.'
  if (e.status === 403) {
    return 'La clave de la pasarela no tiene permisos de cobro/transferencia. Genera una nueva con el rol «Admin».'
  }
  // La misma operación ya está en curso: la pasarela nunca la ejecuta dos veces.
  if (e.status === 409) {
    return 'Esta misma transferencia ya se está procesando. Míralo en el historial dentro de unos minutos.'
  }
  if (e.status === 404) return 'La pasarela no encuentra la cuenta o la transferencia. Vuelve a conectarla en Ajustes.'

  if (/insufficient|not enough|balance/i.test(raw)) {
    return 'Tu saldo disponible ha cambiado mientras se enviaba. Vuelve a intentarlo en unos minutos.'
  }
  if (/acknowledge_bank_warning|account holder|name mismatch/i.test(raw)) {
    return 'El banco no ha podido confirmar que la cuenta esté a nombre del club. Revisa el titular y el número de cuenta.'
  }
  if (/minimum|min_limit|too small/i.test(raw)) {
    return 'El importe es menor que el mínimo que admite tu banco para una transferencia.'
  }
  if (/maximum|max_limit|too large|limit/i.test(raw)) {
    return 'El importe supera el máximo por transferencia. Se enviará en varias veces.'
  }
  if (/invalid|validation|format/i.test(raw)) {
    return 'Alguno de los datos bancarios no tiene el formato correcto. Revísalos y vuelve a guardarlos.'
  }
  return fallback
}

/**
 * Log sin datos bancarios.
 *
 * `WhopError` lleva el cuerpo de la respuesta como propiedad propia, y la
 * pasarela suele repetir dentro el valor que rechazó — un IBAN, por ejemplo.
 * Volcar el error entero dejaría ese dato en los logs en claro.
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
    console.error(`[whop/payouts] ${op} status=${e.status}`, motivo(e))
    return
  }
  // Para lo que no viene de la pasarela, el `code` es lo que separa un fallo
  // de red de una tabla o una columna que faltan.
  console.error(`[whop/payouts] ${op}`, {
    name: e instanceof Error ? e.name : 'error',
    code: (e as { code?: string })?.code ?? '',
  })
}

/**
 * Clave de reintento derivada del contenido exacto de la operación.
 *
 * Importa que dependa de los valores y no de su longitud: la pasarela también
 * repite las respuestas de error, así que si el club se equivoca al teclear la
 * cuenta y la corrige, la clave tiene que cambiar o se quedaría atrapado 24h
 * viendo el mismo error.
 */
function contentKey(prefix: string, parts: Record<string, string>): string {
  const canonical = Object.keys(parts)
    .sort()
    .map((k) => `${k}=${parts[k]}`)
    .join('&')
  return `${prefix}:${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`
}

/** Los importes llegan como cadenas decimales ("1250.40"). */
function decimal(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim())
  return Number.isFinite(n) ? n : 0
}

function mapFields(raw: unknown): PayoutField[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((f) => {
      const o = (f || {}) as Record<string, unknown>
      const input = String(o.input_type || 'text')
      const inputType: PayoutField['inputType'] =
        input === 'options' ? 'options' : input === 'date' ? 'date' : 'text'
      // La pasarela contesta en ingles: se traduce aqui, una vez, y no en cada
      // pantalla que pinte estos campos.
      const id = String(o.id || '')
      const label = String(o.label || '')
      return {
        id,
        label: etiquetaCampo(id, label),
        inputType,
        placeholder: ejemploCampo(id, label, String(o.placeholder || '')),
        options: Array.isArray(o.options) ? o.options.map((x) => String(x)) : [],
        required: o.required !== false,
        sensitive: Boolean(o.sensitive),
        validation: typeof o.validation === 'string' && o.validation ? o.validation : null,
      }
    })
    .filter((f) => f.id)
}

/**
 * Formas de cobro disponibles en el país del club (transferencia bancaria, etc.).
 * Con `methodId` devuelve además los campos concretos que hay que pedirle.
 */
export async function listSupportedMethods(
  country?: string,
  methodId?: string,
): Promise<{ ok: true; methods: SupportedMethod[] } | { ok: false; error: string }> {
  const c = await ctx()
  if (!c.ok) return c
  try {
    const res = await whopRequest<{ data?: Record<string, unknown>[] }>({
      path: '/payouts/supported_methods',
      credential: c.ctx.credential,
      query: {
        account_id: c.ctx.companyId,
        country: country || undefined,
        supported_payout_method_id: methodId || undefined,
        // La divisa en la que el club quiere recibir. Solo cuenta al pedir un
        // método concreto, y ahí es obligatoria en la práctica: la pasarela
        // asume dólares si no se dice, y preguntarle por los datos de una
        // transferencia SEPA que entregue dólares es una contradicción que
        // rechaza con un 400. Los campos que pide el banco cambian con ella.
        destination_currency: methodId ? (c.ctx.payoutCurrency || 'EUR').toLowerCase() : undefined,
        first: 25,
      },
    })
    const methods = (res?.data || [])
      .map((m) => ({
        id: String(m.id || ''),
        name: nombreMetodo(String(m.name || 'Transferencia bancaria')),
        deliveryType: String(m.delivery_type || ''),
        supportsInstant: Boolean(m.supports_instant_delivery),
        requiredFields: mapFields(m.required_fields),
      }))
      // Las criptomonedas se descartan AQUI, no en la pantalla: asi tampoco se
      // puede guardar una saltandose la interfaz, porque el alta valida el
      // metodo contra esta misma lista.
      .filter((m) => !esCripto(m.deliveryType, m.name))
    return { ok: true, methods }
  } catch (e) {
    // Qué se le pidió, sin ningún dato del club: el país y si se acotó a un
    // método concreto es lo único que puede hacer que la pasarela lo rechace.
    logSafe('listSupportedMethods', e)
    console.error('[whop/payouts] listSupportedMethods parámetros', {
      country: country || '(ninguno)',
      conMetodo: Boolean(methodId),
    })
    return { ok: false, error: friendly(e, 'No se pudieron consultar las formas de cobro disponibles.') }
  }
}

/** Guarda la cuenta bancaria del club con los datos que ha rellenado. */
export async function createPayoutMethod(input: {
  supportedMethodId: string
  fields: Record<string, string>
  nickname?: string
  currency?: string
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const c = await ctx()
  if (!c.ok) return c
  try {
    const created = await whopRequest<{ id?: unknown }>({
      method: 'POST',
      path: '/payouts/methods',
      credential: c.ctx.credential,
      // Depende de los valores: si el club corrige la cuenta, la clave cambia y
      // la pasarela ejecuta de nuevo en vez de repetir el resultado anterior.
      idempotencyKey: contentKey(`crm:payoutmethod:${c.ctx.companyId}`, {
        method: input.supportedMethodId,
        fields: JSON.stringify(
          Object.keys(input.fields)
            .sort()
            .map((k) => [k, input.fields[k]]),
        ),
      }),
      body: {
        account_id: c.ctx.companyId,
        supported_payout_method_id: input.supportedMethodId,
        fields: input.fields,
        nickname: (input.nickname || 'Cuenta del club').slice(0, 60),
        // Sin divisa forzada: la marca el propio método según el país. Imponer
        // «eur» a una cuenta mexicana la dejaría inservible.
        ...(input.currency ? { destination_currency: input.currency.toLowerCase() } : {}),
        is_default: true,
      },
    })
    const id = String(created?.id || '')
    if (!id) return { ok: false, error: 'La pasarela no devolvió la cuenta guardada.' }

    // Se anota la divisa que la pasarela ha asignado de verdad, no la que se
    // pidió: es la que decide qué saldo barre la transferencia automática.
    const saved = await listPayoutMethods()
    const currency = saved.ok ? saved.methods.find((m) => m.id === id)?.currency || '' : ''

    // Si esto no se persiste, el barrido creería que el club no tiene cuenta y
    // el dinero se quedaría acumulado con la cuenta visible en pantalla. Es un
    // fallo real, no un detalle: se le dice al club en vez de callarlo.
    try {
      await prisma.clubSettings.update({
        where: { isDefault: true },
        data: {
          whopPayoutMethodId: id,
          whopPayoutsEnabled: true,
          ...(currency ? { whopPayoutCurrency: currency } : {}),
        },
      })
    } catch (e) {
      console.error(`[whop/payouts] no se pudo guardar el método ${id} en el club`, e)
      return {
        ok: false,
        error:
          'La cuenta se ha registrado en la pasarela pero no se pudo guardar en el CRM. Vuelve a intentarlo para que las transferencias automáticas funcionen.',
      }
    }

    return { ok: true, id }
  } catch (e) {
    logSafe('createPayoutMethod', e)
    return { ok: false, error: friendly(e, 'No se pudo guardar la cuenta bancaria. Revisa los datos.') }
  }
}

/** Cuentas bancarias ya guardadas del club. */
export async function listPayoutMethods(): Promise<
  { ok: true; methods: SavedPayoutMethod[] } | { ok: false; error: string }
> {
  const c = await ctx()
  if (!c.ok) return c
  try {
    const res = await whopRequest<{ data?: Record<string, unknown>[] }>({
      path: '/payouts/methods',
      credential: c.ctx.credential,
      query: { account_id: c.ctx.companyId, first: 20 },
    })
    const methods = (res?.data || []).map((m) => ({
      id: String(m.id || ''),
      nickname: String(m.nickname || ''),
      institution: String(m.institution_name || m.payer_name || ''),
      reference: String(m.account_reference || ''),
      currency: String(m.destination_currency || '').toUpperCase(),
      isDefault: Boolean(m.is_default),
      status: String(m.status || ''),
      verification: m.bank_verification_state ? String(m.bank_verification_state) : null,
      unavailableReason: m.unavailable_reason ? String(m.unavailable_reason) : null,
    }))
    return { ok: true, methods }
  } catch (e) {
    logSafe('listPayoutMethods', e)
    return { ok: false, error: friendly(e, 'No se pudieron consultar las cuentas bancarias.') }
  }
}

/**
 * Deja el CRM al día con la cuenta bancaria que la pasarela tiene por defecto.
 *
 * Cubre el caso en que se guardó la cuenta pero el CRM no llegó a anotarla: sin
 * esto el barrido diría «sin cuenta bancaria» para siempre mientras el club ve
 * su cuenta en pantalla.
 */
export async function syncDefaultPayoutMethod(): Promise<string | null> {
  const config = await getWhopClubConfig()
  if (!config.hasCompany || config.hasPayoutMethod) return config.payoutMethodId || null

  const list = await listPayoutMethods()
  if (!list.ok) return null
  const usable = list.methods.filter((m) => !m.unavailableReason && m.status !== 'broken')
  const best = usable.find((m) => m.isDefault) || usable[0]
  if (!best) return null

  try {
    await prisma.clubSettings.update({
      where: { isDefault: true },
      data: {
        whopPayoutMethodId: best.id,
        whopPayoutsEnabled: true,
        ...(best.currency ? { whopPayoutCurrency: best.currency } : {}),
      },
    })
    return best.id
  } catch (e) {
    console.error('[whop/payouts] syncDefaultPayoutMethod', e)
    return null
  }
}

/**
 * Saldo del club en la pasarela, por divisa.
 *
 * `available` es lo único transferible: el total incluye además lo que aún está
 * liquidando y lo que la pasarela retiene como garantía. Barrer el total haría
 * que la pasarela rechazase todas las transferencias.
 */
export async function getBalances(): Promise<{ ok: true; balances: Balance[] } | { ok: false; error: string }> {
  const c = await ctx()
  if (!c.ok) return c
  try {
    const res = await whopRequest<{ balances?: Record<string, unknown>[] }>({
      path: `/accounts/${encodeURIComponent(c.ctx.companyId)}`,
      credential: c.ctx.credential,
    })
    const balances = (res?.balances || []).map((b) => {
      const breakdown = (b.breakdown || {}) as Record<string, unknown>
      return {
        currency: String(b.symbol || '').toUpperCase(),
        available: decimal(breakdown.available),
        pending: decimal(breakdown.pending),
        reserve: decimal(breakdown.reserve),
      }
    })
    return { ok: true, balances: balances.filter((b) => b.currency) }
  } catch (e) {
    logSafe('getBalances', e)
    return { ok: false, error: friendly(e, 'No se pudo consultar el saldo.') }
  }
}

export type PayoutQuote = {
  /** Comisión de la pasarela por esta transferencia. */
  fee: number
  /** Lo que llega de verdad al banco. */
  received: number
  minAmount: number
  maxAmount: number | null
}

/**
 * Qué comisión lleva transferir `amount` y cuánto llega al banco.
 * Sirve para enseñárselo al club antes de que confirme.
 */
export async function getPayoutQuote(
  amount: number,
  currency: string,
  payoutMethodId: string,
): Promise<PayoutQuote | null> {
  const c = await ctx()
  if (!c.ok) return null
  try {
    const res = await whopRequest<{ data?: Record<string, unknown>[] }>({
      path: '/payouts/methods',
      credential: c.ctx.credential,
      query: {
        account_id: c.ctx.companyId,
        amount: amount.toFixed(2),
        currency: currency.toLowerCase(),
        first: 20,
      },
    })
    const method = (res?.data || []).find((m) => String(m.id || '') === payoutMethodId)
    const quote = (method?.quote || null) as Record<string, unknown> | null
    if (!quote) return null
    const standard = (quote.standard || null) as Record<string, unknown> | null
    return {
      fee: decimal(standard?.fee),
      received: standard ? decimal(standard.total_received) : 0,
      minAmount: decimal(quote.min_limit),
      maxAmount: quote.max_limit == null ? null : decimal(quote.max_limit),
    }
  } catch (e) {
    logSafe('getPayoutQuote', e)
    return null
  }
}

/** Transfiere saldo del club a su cuenta bancaria. */
export async function createPayout(input: {
  amount: number
  currency: string
  payoutMethodId: string
  /** Nota que acompaña a la transferencia (máx. 255 caracteres). */
  descriptor?: string
  /** Debe ser estable por operación: es lo que impide transferir dos veces. */
  idempotencyKey: string
  /** Referencia del CRM, para poder reconciliar si se pierde la respuesta. */
  reference?: string
}): Promise<
  | { ok: true; id: string }
  | { ok: false; error: string; indeterminate: boolean }
> {
  const c = await ctx()
  if (!c.ok) return { ok: false, error: c.error, indeterminate: false }

  const amount = Number(input.amount.toFixed(2))
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Importe de transferencia no válido.', indeterminate: false }
  }

  try {
    const created = await whopRequest<{ id?: unknown }>({
      method: 'POST',
      path: '/payouts',
      credential: c.ctx.credential,
      idempotencyKey: input.idempotencyKey,
      body: {
        account_id: c.ctx.companyId,
        amount,
        currency: (input.currency || 'eur').toLowerCase(),
        payout_method_id: input.payoutMethodId,
        speed: 'standard',
        notes: (input.descriptor || 'Cobros de cuotas').slice(0, 255),
        ...(input.reference ? { metadata: { crm_payout_ref: input.reference } } : {}),
      },
    })
    const id = String(created?.id || '')
    // Sin id no se sabe si se ha ejecutado: se marca indeterminado para que el
    // barrido lo compruebe antes de volver a intentarlo.
    if (!id) {
      return { ok: false, error: 'La pasarela no confirmó la transferencia.', indeterminate: true }
    }
    return { ok: true, id }
  } catch (e) {
    logSafe('createPayout', e)
    // Un 4xx es un rechazo firme: la transferencia no existe. Un timeout, un
    // 5xx o un 409 dejan el resultado en el aire y NO se pueden dar por fallidos
    // sin comprobarlo, o se acabaría transfiriendo dos veces.
    const status = e instanceof WhopError ? e.status : 0
    const indeterminate = !(status >= 400 && status < 500) || status === 409
    return { ok: false, error: friendly(e, 'No se pudo enviar la transferencia.'), indeterminate }
  }
}

export type PayoutRow = {
  id: string
  amount: number
  currency: string
  /** Lo que llega al banco después de comisiones. */
  net: number
  status: string
  createdAt: string
  /** Referencia del CRM que se envió al pedirla, si la lleva. */
  reference: string | null
}

/** Historial de transferencias al banco del club. */
export async function listPayouts(
  limit = 20,
): Promise<{ ok: true; payouts: PayoutRow[] } | { ok: false; error: string }> {
  const c = await ctx()
  if (!c.ok) return c
  try {
    const res = await whopRequest<{ data?: Record<string, unknown>[] }>({
      path: '/payouts',
      credential: c.ctx.credential,
      query: { account_id: c.ctx.companyId, first: Math.min(Math.max(limit, 1), 50) },
    })
    const payouts = (res?.data || []).map((p) => {
      const metadata = (p.metadata || {}) as Record<string, unknown>
      return {
        id: String(p.id || ''),
        amount: decimal(p.amount),
        currency: String(p.currency || '').toUpperCase(),
        net: decimal(p.net_amount ?? p.amount),
        status: String(p.status || ''),
        createdAt: String(p.created_at || ''),
        reference: metadata.crm_payout_ref ? String(metadata.crm_payout_ref) : null,
      }
    })
    return { ok: true, payouts }
  } catch (e) {
    logSafe('listPayouts', e)
    return { ok: false, error: friendly(e, 'No se pudo consultar el historial de transferencias.') }
  }
}

/** Estados de la pasarela que significan «este dinero ya ha salido o va a salir». */
export const PAYOUT_LIVE_STATUSES = ['requested', 'in_review', 'processing', 'completed']

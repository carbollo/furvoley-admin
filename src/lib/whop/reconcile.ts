import { prisma } from '@/lib/prisma'
import { recordInvoicePayment, createInvoiceForSubscription } from '@/app/actions/billing'

/**
 * Conciliación de los eventos de cobro de la pasarela con la facturación del CRM.
 *
 * Reglas que sostienen todo esto:
 *  - Las entregas son **at-least-once**: el mismo pago puede llegar varias veces.
 *    El dedupe real lo hace la BD (`PaymentAttempt.externalPaymentId` es único) en
 *    la misma transacción que mueve el dinero, no una comprobación previa.
 *  - La `metadata` que el CRM adjuntó al crear el enlace vuelve en el pago: es lo
 *    que ata cada euro a su factura o a su cuota, sin adivinar por importes.
 *  - Un cobro que no se puede conciliar NUNCA se descarta en silencio: se guarda
 *    para revisión (`WhopUnreconciledEvent`), porque al otro lado hay un socio que
 *    ya ha pagado.
 *
 * Módulo de servidor puro (sin 'use server').
 */

export type ReconcileOutcome = {
  /** true = procesado (o descartado a propósito). false = hay que reintentar. */
  handled: boolean
  detail: string
  /** true si se guardó como no conciliado para revisión manual. */
  parked?: boolean
}

export type PaymentData = {
  id?: unknown
  status?: unknown
  currency?: unknown
  metadata?: Record<string, unknown> | null
  membership?: { id?: unknown } | null
  member?: { id?: unknown } | null
  billing_reason?: unknown
  /** Importe bruto que ve el club (excluye las comisiones que paga el comprador). */
  total?: unknown
  subtotal?: unknown
  amount_after_fees?: unknown
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Importe abonado, en el sentido que le importa al club: `total` es "el total que
 * ve el creador". `amount_after_fees` sería el neto tras comisiones y dejaría la
 * factura eternamente a medias, así que solo se usa como último recurso.
 */
function paidAmountOf(p: PaymentData): number | null {
  return num(p.total) ?? num(p.subtotal) ?? num(p.amount_after_fees)
}

/** Aparca un evento que no se ha podido conciliar, para que nadie pierda un cobro. */
export async function parkEvent(input: {
  eventType: string
  payment: PaymentData
  reason: string
  payload: unknown
}): Promise<void> {
  try {
    await prisma.whopUnreconciledEvent.create({
      data: {
        eventType: input.eventType,
        externalId: str(input.payment?.id) || null,
        amount: paidAmountOf(input.payment ?? {}),
        currency: str(input.payment?.currency) || null,
        reason: input.reason.slice(0, 500),
        payload: (input.payload ?? {}) as never,
      },
    })
  } catch (e) {
    // Si ni siquiera se puede aparcar, que quede en el log del servidor.
    console.error('[whop/reconcile] no se pudo aparcar el evento', input.reason, e)
  }
}

/**
 * Un cobro correcto: marca la factura como pagada.
 *
 * Tres orígenes posibles:
 *  1. Factura concreta (`invoice_id` en la metadata) → cobro puntual.
 *  2. Alta de cuota (`subscription_id`) → vincula la suscripción y liquida su
 *     primera factura.
 *  3. Renovación de una cuota ya vinculada (por `membership`) → emite la factura
 *     del periodo y la marca pagada.
 */
export async function reconcilePaymentSucceeded(payment: PaymentData): Promise<ReconcileOutcome> {
  const externalPaymentId = str(payment.id)
  const amount = paidAmountOf(payment)
  const currency = str(payment.currency).toUpperCase()

  if (!externalPaymentId) return { handled: false, detail: 'pago sin identificador' }
  if (amount === null) return { handled: false, detail: 'pago sin importe reconocible' }
  // Un alta gratuita (0 €) es válida: liquida la factura sin mover dinero.
  if (amount < 0) return { handled: false, detail: 'importe negativo' }

  // Corte temprano ante reentregas. La BD es la garantía final (clave única en la
  // misma transacción que el dinero), pero sin este atajo una reentrega llegaría
  // a emitir la factura del periodo siguiente antes de descubrir el duplicado:
  // factura fantasma reclamada al socio y un mes de cuota que nunca se factura.
  const previous = await prisma.paymentAttempt.findFirst({
    where: { externalPaymentId, status: 'SUCCEEDED' },
    select: { id: true },
  })
  if (previous) return { handled: true, detail: 'ya registrado (reentrega)' }

  const meta = (payment.metadata || {}) as Record<string, unknown>
  const invoiceId = str(meta.invoice_id)
  const subscriptionId = str(meta.subscription_id)
  const membershipId = str(payment.membership?.id)

  if (invoiceId) {
    return settleInvoice({ invoiceId, amount, currency, externalPaymentId })
  }

  if (subscriptionId) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { id: true, whopMembershipId: true },
    })
    if (!subscription) return { handled: false, detail: `cuota ${subscriptionId} no encontrada` }

    // Sin `.catch`: si el vínculo no se graba, TODAS las renovaciones futuras
    // llegarían huérfanas. Mejor devolver error y que la pasarela reintente.
    if (membershipId && !subscription.whopMembershipId) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { whopMembershipId: membershipId, autoPay: true, status: 'ACTIVE' },
      })
    }
    return settleSubscriptionPeriod({ subscriptionId: subscription.id, amount, currency, externalPaymentId })
  }

  if (membershipId) {
    const subscription = await prisma.subscription.findFirst({
      where: { whopMembershipId: membershipId },
      select: { id: true, status: true },
    })
    if (!subscription) return { handled: false, detail: `membresía ${membershipId} sin cuota vinculada` }
    // La pasarela ha vuelto a cobrar: si la cuota se pausó por un impago anterior,
    // el socio está de nuevo al corriente y debe volver a facturarse.
    if (subscription.status === 'PAUSED') {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'ACTIVE', autoPay: true },
      })
    }
    return settleSubscriptionPeriod({ subscriptionId: subscription.id, amount, currency, externalPaymentId })
  }

  return { handled: false, detail: 'pago sin referencia del CRM' }
}

/** Aplica un cobro a una factura concreta, validando moneda y estado. */
async function settleInvoice(input: {
  invoiceId: string
  amount: number
  currency: string
  externalPaymentId: string
}): Promise<ReconcileOutcome> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { id: true, status: true, currency: true, totalAmount: true, paidAmount: true },
  })
  if (!invoice) return { handled: false, detail: `factura ${input.invoiceId} no encontrada` }
  if (invoice.status === 'VOID') return { handled: false, detail: 'la factura está anulada' }
  if (invoice.status === 'PAID') return { handled: false, detail: 'la factura ya estaba pagada' }

  // Nunca sumar importes de monedas distintas: 50 USD no son 50 EUR.
  const invoiceCurrency = (invoice.currency || 'EUR').toUpperCase()
  if (input.currency && input.currency !== invoiceCurrency) {
    return { handled: false, detail: `moneda distinta (${input.currency} vs ${invoiceCurrency})` }
  }

  const result = await recordInvoicePayment({
    invoiceId: invoice.id,
    amount: input.amount,
    method: 'WHOP',
    status: 'SUCCEEDED',
    externalPaymentId: input.externalPaymentId,
  })
  if (result?.duplicate) return { handled: true, detail: 'ya registrado (reentrega)' }

  // El enlace cacheado apuntaba al importe anterior: deja de ser válido.
  await prisma.invoice
    .update({
      where: { id: invoice.id },
      data: { whopCheckoutUrl: null, whopCheckoutId: null, whopCheckoutAmount: null },
    })
    .catch(() => null)

  // Si no cubre lo pendiente (p. ej. el plan de la pasarela va a otro precio), la
  // factura queda a medias: se avisa para que alguien lo mire.
  const pendingBefore = Number((invoice.totalAmount - invoice.paidAmount).toFixed(2))
  if (input.amount + 0.01 < pendingBefore) {
    return {
      handled: true,
      detail: `cobro parcial: ${input.amount} de ${pendingBefore} pendientes`,
      parked: true,
    }
  }
  return { handled: true, detail: `factura ${invoice.id} cobrada` }
}

/**
 * Liquida el periodo de una cuota: usa su factura pendiente más antigua y, si no
 * hay ninguna, emite la del periodo (lo que además avanza la fecha de la próxima,
 * evitando que el cron la duplique después).
 */
async function settleSubscriptionPeriod(input: {
  subscriptionId: string
  amount: number
  currency: string
  externalPaymentId: string
}): Promise<ReconcileOutcome> {
  const pending = await prisma.invoice.findFirst({
    where: { subscriptionId: input.subscriptionId, status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] } },
    orderBy: { issueDate: 'asc' },
    select: { id: true },
  })

  let invoiceId = pending?.id
  if (!invoiceId) {
    // Sin `.catch`: si falla, que el webhook devuelva 500 y la pasarela reintente.
    // Tragarlo dejaría el cobro sin registrar y sin posibilidad de reintento.
    const created = await createInvoiceForSubscription(input.subscriptionId)
    invoiceId = created?.id
  }
  if (!invoiceId) return { handled: false, detail: 'no se pudo determinar la factura del periodo' }

  return settleInvoice({
    invoiceId,
    amount: input.amount,
    currency: input.currency,
    externalPaymentId: input.externalPaymentId,
  })
}

/** Cobro fallido: deja constancia y marca la factura como vencida. */
export async function reconcilePaymentFailed(payment: PaymentData): Promise<ReconcileOutcome> {
  const meta = (payment.metadata || {}) as Record<string, unknown>
  const invoiceId = str(meta.invoice_id)
  const membershipId = str(payment.membership?.id)

  let targetInvoiceId = invoiceId
  if (!targetInvoiceId && membershipId) {
    const sub = await prisma.subscription.findFirst({
      where: { whopMembershipId: membershipId },
      select: { id: true },
    })
    if (sub) {
      const pending = await prisma.invoice.findFirst({
        where: { subscriptionId: sub.id, status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] } },
        orderBy: { issueDate: 'asc' },
        select: { id: true },
      })
      targetInvoiceId = pending?.id || ''
    }
  }
  if (!targetInvoiceId) return { handled: false, detail: 'cobro fallido sin factura asociada' }

  const failedId = str(payment.id)
  const result = await recordInvoicePayment({
    invoiceId: targetInvoiceId,
    amount: paidAmountOf(payment) ?? 0,
    method: 'WHOP',
    status: 'FAILED',
    // Espacio de claves separado del éxito: la pasarela reutiliza el mismo id
    // cuando reintenta un cobro, y compartir clave haría que el cobro BUENO
    // posterior se tomara por duplicado y no llegara nunca a la factura.
    externalPaymentId: failedId ? `failed:${failedId}` : undefined,
    errorMessage: 'La pasarela no pudo cobrar el recibo.',
  })
  if (result?.duplicate) return { handled: true, detail: 'fallo ya registrado (reentrega)' }

  // Solo se marca vencida si sigue pendiente: los eventos NO llegan ordenados y
  // un `failed` rezagado no debe reabrir una factura ya cobrada.
  await prisma.invoice
    .updateMany({
      where: { id: targetInvoiceId, status: { in: ['PENDING', 'PARTIAL'] } },
      data: { status: 'OVERDUE' },
    })
    .catch(() => null)

  return { handled: true, detail: `factura ${targetInvoiceId} marcada vencida` }
}

/**
 * La membresía deja de estar activa (impago, cancelación). La cuota se pausa pero
 * **se conserva el vínculo**: la pasarela puede reactivar esa misma membresía si el
 * socio actualiza su tarjeta, y sin el vínculo esos cobros llegarían huérfanos.
 */
export async function reconcileMembershipEnded(membership: { id?: unknown }): Promise<ReconcileOutcome> {
  const membershipId = str(membership?.id)
  if (!membershipId) return { handled: false, detail: 'evento sin membresía' }

  const sub = await prisma.subscription.findFirst({
    where: { whopMembershipId: membershipId },
    select: { id: true },
  })
  if (!sub) return { handled: false, detail: 'membresía sin cuota vinculada' }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: 'PAUSED', autoPay: false },
  })
  return { handled: true, detail: `cuota ${sub.id} pausada` }
}

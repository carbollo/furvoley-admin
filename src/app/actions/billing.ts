// Módulo de SERVIDOR (deliberadamente SIN 'use server'): estas funciones NO son
// server actions RPC. Solo las invocan, ya autorizados, las rutas API (requireRoles),
// el webhook de Stripe (firma), los crons (forEachTenant), los workflows y Hermes
// (Bearer), además de otros módulos de servidor. Antes tenía 'use server', lo que
// exponía cada función (cobros, planes, suscripciones, facturas) como endpoint RPC
// invocable por cualquier cliente autenticado sin comprobación de rol.
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getStripe } from '@/lib/stripe'
import { createJournalEntry } from '@/lib/accounting/engine'
import { ensureBasePgcAccounts } from '@/lib/accounting/pgc'
import { getClubIssuer, getStripeConnectConfig } from '@/lib/club-settings'
import type Stripe from 'stripe'
import { sendApiWassText } from '@/lib/apiwass'
import { getWhatsAppConfig } from '@/lib/whatsapp-config'
import {
  advanceBillingDate,
  billingDueDate,
  clampBillingDay,
  nextBillingDate,
} from '@/lib/billing-dates'
import { ensureMemberStripeCustomer } from '@/lib/stripe-member-customer'
import { createInvoiceWithNumber, nextInvoiceNumber, isUniqueViolation } from '@/lib/crm-invoice-create'
import {
  runInvoiceCreatedWorkflows,
  runEnrollmentPaymentDueWorkflows,
  runInvoiceOverdueWorkflows,
  runInvoicePaidWorkflows,
  runMemberStatusChangedWorkflows,
  runSubscriptionCreatedWorkflows,
} from '@/lib/workflow-engine'

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addPeriod(date: Date, period: string) {
  const d = new Date(date)
  if (period === 'MONTHLY') d.setMonth(d.getMonth() + 1)
  else if (period === 'QUARTERLY') d.setMonth(d.getMonth() + 3)
  else d.setFullYear(d.getFullYear() + 1)
  return d
}

export async function createMembershipPlan(data: {
  name: string
  description?: string
  amount: number
  billingPeriod: string
  enrollmentFee?: number
  paymentRequiredOnEnrollment?: boolean
  billingDayOfMonth?: number
}) {
  const plan = await prisma.membershipPlan.create({
    data: {
      ...data,
      enrollmentFee: data.enrollmentFee ?? 0,
      paymentRequiredOnEnrollment: data.paymentRequiredOnEnrollment ?? false,
      billingDayOfMonth: clampBillingDay(data.billingDayOfMonth ?? 1),
    },
  })
  revalidatePath('/')
  return plan
}

export async function updateMembershipPlan(
  id: string,
  data: {
    name?: string
    description?: string
    amount?: number
    billingPeriod?: string
    enrollmentFee?: number
    paymentRequiredOnEnrollment?: boolean
    billingDayOfMonth?: number
    isActive?: boolean
  },
) {
  const patch = { ...data }
  if (patch.billingDayOfMonth != null) {
    patch.billingDayOfMonth = clampBillingDay(patch.billingDayOfMonth)
  }
  const plan = await prisma.membershipPlan.update({
    where: { id },
    data: patch,
  })
  revalidatePath('/')
  return plan
}

export async function deleteMembershipPlan(id: string) {
  // Si tiene suscripciones activas, no permitir borrado duro
  const hasSubscriptions = await prisma.subscription.count({
    where: { planId: id },
  })

  if (hasSubscriptions > 0) {
    // Soft delete
    await prisma.membershipPlan.update({
      where: { id },
      data: { isActive: false },
    })
  } else {
    await prisma.membershipPlan.delete({
      where: { id },
    })
  }

  revalidatePath('/')
}

export async function createSubscription(data: {
  memberId: string
  planId: string
  startDate?: Date
  autoPay?: boolean
  paymentRequiredOnEnrollment?: boolean
  /** Código de descuento (roadmap · 6.5) aplicado a las facturas de la suscripción. */
  discountCodeId?: string | null
  /** false en altas masivas: evita mandar un aviso de cobro por cada socio. */
  notifyEnrollment?: boolean
}) {
  const plan = await prisma.membershipPlan.findUnique({ where: { id: data.planId } })
  if (!plan) throw new Error('Plan not found')

  const paymentRequired =
    data.paymentRequiredOnEnrollment ?? plan.paymentRequiredOnEnrollment ?? false

  const startDate = data.startDate ?? new Date()
  const billingDay = clampBillingDay(plan.billingDayOfMonth)
  const initialNextInvoiceDate = paymentRequired
    ? startOfDay(new Date())
    : nextBillingDate(startDate, billingDay, plan.billingPeriod)

  void ensureMemberStripeCustomer(data.memberId).catch(() => {})

  const subscription = await prisma.subscription.create({
    data: {
      memberId: data.memberId,
      planId: data.planId,
      startDate,
      nextInvoiceDate: initialNextInvoiceDate,
      autoPay: data.autoPay ?? false,
      paymentRequiredOnEnrollment: paymentRequired,
      discountCodeId: data.discountCodeId || null,
    },
  })

  if (paymentRequired) {
    const member = await prisma.member.findUnique({ where: { id: data.memberId } })
    if (member && member.status !== 'INACTIVE') {
      const prev = member.status
      await prisma.member.update({
        where: { id: data.memberId },
        data: { status: 'PENDING_PAYMENT' },
      })
      if (prev !== 'PENDING_PAYMENT') {
        await runMemberStatusChangedWorkflows(data.memberId, {
          previousStatus: prev,
          currentStatus: 'PENDING_PAYMENT',
        })
      }
    }
  }

  // first invoice
  await createInvoiceForSubscription(subscription.id, data.notifyEnrollment !== false)
  await runSubscriptionCreatedWorkflows(subscription.id)
  revalidatePath('/')
  return subscription
}

async function tryActivateMemberAfterEnrollmentPayment(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { subscription: true, member: true },
  })
  if (!invoice?.subscription?.paymentRequiredOnEnrollment) return
  if (invoice.status !== 'PAID') return
  if (invoice.member.status !== 'PENDING_PAYMENT') return

  const prev = invoice.member.status
  await prisma.member.update({
    where: { id: invoice.memberId },
    data: { status: 'ACTIVE' },
  })
  await runMemberStatusChangedWorkflows(invoice.memberId, {
    previousStatus: prev,
    currentStatus: 'ACTIVE',
  })
}

/**
 * @param notifyEnrollment  Si es false, NO se dispara el aviso de cobro al alta.
 *   Lo usan la importación masiva y las acciones en lote: con 500 socios, avisar
 *   a cada uno significaría 500 llamadas a la pasarela y 500 WhatsApps dentro de
 *   la misma petición.
 */
export async function createInvoiceForSubscription(subscriptionId: string, notifyEnrollment = true) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, member: true, discountCode: true },
  })
  if (!subscription) throw new Error('Subscription not found')

  const priorInvoiceCount = await prisma.invoice.count({
    where: { subscriptionId: subscription.id },
  })
  const isFirstInvoice = priorInvoiceCount === 0
  const enrollmentRequired = subscription.paymentRequiredOnEnrollment && isFirstInvoice
  const billingDay = clampBillingDay(subscription.plan.billingDayOfMonth)
  const cycleDate = startOfDay(subscription.nextInvoiceDate)

  let dueDate: Date
  if (enrollmentRequired) {
    dueDate = startOfDay(new Date())
  } else if (isFirstInvoice) {
    dueDate = nextBillingDate(new Date(), billingDay, subscription.plan.billingPeriod)
  } else {
    dueDate = billingDueDate(cycleDate, billingDay)
  }

  const periodAmount = subscription.plan.amount
  const enrollmentAmount =
    isFirstInvoice && subscription.plan.enrollmentFee > 0 ? subscription.plan.enrollmentFee : 0

  // Descuento de la suscripción (roadmap · 6.5): % o importe fijo sobre la
  // cuota del periodo (no sobre la matrícula), sin dejarla en negativo.
  const dc = subscription.discountCode
  let discountAmount = 0
  if (dc && dc.isActive && dc.value > 0) {
    const raw = dc.kind === 'FIXED' ? dc.value : periodAmount * (dc.value / 100)
    discountAmount = Math.min(periodAmount, Math.round(raw * 100) / 100)
  }

  const subtotal = periodAmount + enrollmentAmount - discountAmount
  const taxAmount = 0
  const total = subtotal + taxAmount

  const items: { description: string; quantity: number; unitAmount: number; totalAmount: number }[] = [
    {
      description: `${subscription.plan.name} (${subscription.plan.billingPeriod})`,
      quantity: 1,
      unitAmount: periodAmount,
      totalAmount: periodAmount,
    },
  ]
  if (enrollmentAmount > 0) {
    items.push({
      description: `Matrícula / alta — ${subscription.plan.name}`,
      quantity: 1,
      unitAmount: enrollmentAmount,
      totalAmount: enrollmentAmount,
    })
  }
  if (discountAmount > 0 && dc) {
    items.push({
      description: `Descuento ${dc.label} (${dc.code})${dc.kind === 'PERCENT' ? ` · ${dc.value}%` : ''}`,
      quantity: 1,
      unitAmount: -discountAmount,
      totalAmount: -discountAmount,
    })
  }

  const today = startOfDay(new Date())
  const invoiceStatus = startOfDay(dueDate) < today ? 'OVERDUE' : 'PENDING'

  const nextInvoiceDate =
    enrollmentRequired && isFirstInvoice
      ? nextBillingDate(new Date(), billingDay, subscription.plan.billingPeriod)
      : advanceBillingDate(cycleDate, billingDay, subscription.plan.billingPeriod)

  // Factura + avance de `nextInvoiceDate` en UNA transacción atómica: si algo falla
  // entre medias ya no queda la factura creada con la suscripción SIN avanzar (lo
  // que provocaría re-facturar el mismo periodo = doble cobro). El número se deriva
  // de max(num)+1 y se reintenta ante colisión de unicidad por concurrencia.
  let invoice: Awaited<ReturnType<typeof prisma.invoice.create>> | undefined
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    const invoiceNumber = await nextInvoiceNumber()
    try {
      const [created] = await prisma.$transaction([
        prisma.invoice.create({
          data: {
            invoiceNumber,
            kind: 'MEMBERSHIP',
            issueDate: new Date(),
            dueDate,
            subtotal,
            taxAmount,
            totalAmount: total,
            status: invoiceStatus,
            memberId: subscription.memberId,
            subscriptionId: subscription.id,
            items: { create: items },
          },
        }),
        prisma.subscription.update({
          where: { id: subscription.id },
          data: { nextInvoiceDate },
        }),
      ])
      invoice = created
      break
    } catch (e) {
      lastErr = e
      if (isUniqueViolation(e)) continue
      throw e
    }
  }
  if (!invoice) throw lastErr

  if (invoiceStatus === 'OVERDUE') {
    await runInvoiceOverdueWorkflows(invoice.id)
  }
  if (enrollmentRequired && notifyEnrollment) {
    // Alta que exige pago: evento propio, con el enlace de cobro ya resuelto.
    // Sustituye a INVOICE_CREATED en este caso (no se emiten los dos) para que el
    // socio no reciba dos mensajes casi idénticos si el club tiene flujos en ambos.
    //
    // Va fuera del camino crítico: generar el enlace habla con la pasarela y
    // enviar el WhatsApp con otro proveedor; si algo se atasca, el alta del socio
    // no debe quedarse colgada esperando.
    void runEnrollmentPaymentDueWorkflows(invoice.id).catch((e) =>
      console.error('[billing] flujo de cobro al alta', invoice?.id, e),
    )
  } else {
    await runInvoiceCreatedWorkflows(invoice.id)
  }
  return invoice
}

export async function generateDueInvoices() {
  const today = startOfDay(new Date())
  const dueSubscriptions = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      nextInvoiceDate: { lte: today },
    },
  })

  const created: string[] = []
  const failed: { subscriptionId: string; error: string }[] = []
  for (const subscription of dueSubscriptions) {
    // Aísla cada suscripción: un fallo puntual (p.ej. datos de un socio) no debe
    // impedir facturar al resto del club.
    try {
      const invoice = await createInvoiceForSubscription(subscription.id)
      created.push(invoice.id)
    } catch (e) {
      failed.push({ subscriptionId: subscription.id, error: e instanceof Error ? e.message : String(e) })
      console.error('[billing] generateDueInvoices: suscripción falló', subscription.id, e)
    }
  }

  await updateInvoiceStatuses()
  revalidatePath('/')
  return { createdCount: created.length, failedCount: failed.length }
}

export async function createManualInvoice(data: {
  memberId: string
  dueDate: Date
  items: { description: string; quantity: number; unitAmount: number }[]
  taxAmount?: number
}) {
  if (!data.items.length) throw new Error('Añade al menos un concepto')

  const subtotal = data.items.reduce((s, i) => s + i.quantity * i.unitAmount, 0)
  const taxAmount = data.taxAmount ?? 0
  const total = subtotal + taxAmount

  const invoice = await createInvoiceWithNumber((invoiceNumber) => ({
    data: {
      invoiceNumber,
      kind: 'OTHER',
      issueDate: new Date(),
      dueDate: data.dueDate,
      subtotal,
      taxAmount,
      totalAmount: total,
      memberId: data.memberId,
      items: {
        create: data.items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitAmount: i.unitAmount,
          totalAmount: i.quantity * i.unitAmount,
        })),
      },
    },
  }))

  await runInvoiceCreatedWorkflows(invoice.id)
  revalidatePath('/')
  return invoice
}

export async function runBillingAutomation() {
  const generated = await generateDueInvoices()
  await updateInvoiceStatuses()
  const reminders = await runReminderJob()
  revalidatePath('/')
  revalidatePath('/')
  return {
    generatedInvoices: generated.createdCount,
    remindersSent: reminders.sent,
  }
}

export async function updateInvoiceStatuses() {
  const today = startOfDay(new Date())
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['PENDING', 'PARTIAL'] },
      dueDate: { lt: today },
    },
  })
  for (const invoice of invoices) {
    if (invoice.paidAmount < invoice.totalAmount) {
      const prev = invoice.status
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'OVERDUE' },
      })
      if (prev !== 'OVERDUE') {
        await runInvoiceOverdueWorkflows(invoice.id)
      }
    }
  }
  revalidatePath('/')
}

export async function recordInvoicePayment(data: {
  invoiceId: string
  amount: number
  method?: string
  status?: string
  stripePaymentIntent?: string
  stripeSessionId?: string
  /** Id del pago en la pasarela: clave de dedupe (@unique) ante reentregas. */
  externalPaymentId?: string
  errorMessage?: string
  bankReference?: string | null
}) {
  const invoice = await prisma.invoice.findUnique({ where: { id: data.invoiceId } })
  if (!invoice) throw new Error('Invoice not found')

  const attemptData = {
    invoiceId: data.invoiceId,
    amount: data.amount,
    method: data.method ?? 'STRIPE',
    status: data.status ?? 'SUCCEEDED',
    stripePaymentIntent: data.stripePaymentIntent,
    stripeSessionId: data.stripeSessionId,
    externalPaymentId: data.externalPaymentId,
    errorMessage: data.errorMessage,
  }

  if ((data.status ?? 'SUCCEEDED') === 'SUCCEEDED') {
    // El registro del intento y el movimiento del dinero van en la MISMA
    // transacción: si se separan, una caída entre ambos deja un cobro "registrado"
    // que nunca sumó (y el dedupe posterior lo daría por bueno, perdiéndolo).
    // El `externalPaymentId` es @unique: una reentrega choca con P2002 y aborta
    // TODA la transacción, que es exactamente el comportamiento deseado.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.paymentAttempt.create({ data: attemptData })
        const inc = await tx.invoice.update({
          where: { id: invoice.id },
          data: { paidAmount: { increment: data.amount } },
        })
        const paid = inc.paidAmount >= inc.totalAmount
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: paid ? 'PAID' : 'PARTIAL',
            paidAt: paid ? (inc.paidAt ?? new Date()) : null,
          },
        })
      })
    } catch (e) {
      // Reentrega del mismo pago: ya estaba contabilizado, nada que hacer.
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
        return { duplicate: true }
      }
      throw e
    }
  } else {
    // Intentos fallidos: no mueven dinero, pero también se deduplican por id.
    try {
      await prisma.paymentAttempt.create({ data: attemptData })
    } catch (e) {
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
        return { duplicate: true }
      }
      throw e
    }
  }

  if ((data.status ?? 'SUCCEEDED') === 'SUCCEEDED') {
    const method = data.method ?? 'STRIPE'

    // ⚠️ Política contable: los cobros recibidos por Stripe **no** generan
    // automáticamente Transaction ni JournalEntry. La contabilidad oficial se
    // llena exclusivamente desde el CSV bancario (importBankCsv +
    // reconcileBankLine). Cuando el ingreso de Stripe aparezca en el extracto,
    // el admin lo conciliará o creará el asiento desde la línea bancaria.
    //
    // Para BANK_TRANSFER y CASH (cobros registrados manualmente desde el CRM)
    // sí creamos el asiento de inmediato, porque esos cobros nunca pasan por
    // el CSV bancario (efectivo en mano) o porque su matching con el extracto
    // se hará por importe/referencia (transferencia manual).
    // WHOP sigue la MISMA política que STRIPE: el dinero llega a la cuenta de la
    // pasarela y solo entra en el banco del club cuando se transfiere, así que el
    // asiento se crea al conciliar el extracto, no al cobrar.
    if (method !== 'STRIPE' && method !== 'WHOP') {
      let source = 'INVOICE_PAYMENT'
      if (method === 'BANK_TRANSFER') source = 'BANK_TRANSFER'
      else if (method === 'CASH') source = 'CASH'

      await prisma.transaction.create({
        data: {
          type: 'INCOME',
          amount: data.amount,
          description: `Cobro factura ${invoice.invoiceNumber} (${method})`,
          date: new Date(),
          invoiceId: invoice.id,
          source,
          bankReference: data.bankReference ?? null,
        },
      })

      await ensureBasePgcAccounts()
      const cashAccount = method === 'CASH' ? '5700000' : '5720000'
      await createJournalEntry({
        concept: `Cobro factura ${invoice.invoiceNumber} (${method})`,
        entryDate: new Date(),
        source: 'PAYMENT',
        sourceId: invoice.id,
        lines: [
          {
            accountCode: cashAccount,
            side: 'DEBIT',
            amount: data.amount,
            lineConcept: 'Cobro recibido',
            memberId: invoice.memberId,
          },
          {
            accountCode: '4300000',
            side: 'CREDIT',
            amount: data.amount,
            lineConcept: 'Cancelación parcial/total de cliente',
            memberId: invoice.memberId,
          },
        ],
      })
    }

    if ((data.status ?? 'SUCCEEDED') === 'SUCCEEDED') {
      const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } })
      if (updated && updated.status === 'PAID') {
        await runInvoicePaidWorkflows(invoice.id)
        await tryActivateMemberAfterEnrollmentPayment(invoice.id)
      }
    }
  }

  revalidatePath('/')
  revalidatePath('/accounting')
  revalidatePath('/my-billing')
  revalidatePath('/')
}

export async function recordManualInvoicePayment(data: {
  invoiceId: string
  amount: number
  method: 'BANK_TRANSFER' | 'CASH'
  bankReference?: string | null
}) {
  await recordInvoicePayment({
    invoiceId: data.invoiceId,
    amount: data.amount,
    method: data.method,
    status: 'SUCCEEDED',
    bankReference: data.bankReference ?? null,
  })
}

/** Enlace de pago de una factura con la pasarela activa del club. */
export async function createInvoiceStripeLink(invoiceId: string) {
  const { createInvoiceCheckoutUrl } = await import('@/lib/payments/invoice-checkout')
  const result = await createInvoiceCheckoutUrl(invoiceId)
  if (!result.ok) throw new Error(result.error)
  revalidatePath('/my-billing')
  return result.url
}

export async function createSubscriptionStripeLink(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { member: true, plan: true },
  })
  if (!subscription) throw new Error('Subscription not found')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const issuer = await getClubIssuer()
  const connect = await getStripeConnectConfig()
  const clubSlug = issuer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'club'

  const stripe = getStripe()
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    client_reference_id: subscription.id,
    metadata: {
      subscriptionId: subscription.id,
      memberId: subscription.memberId,
      clubId: clubSlug,
      clubName: issuer.name,
      clubLegalName: issuer.legalName || '',
      clubTaxId: issuer.taxId || '',
      stripeAccount: connect.connectedAccountId || '',
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: subscription.plan.currency.toLowerCase(),
          unit_amount: Math.round(subscription.plan.amount * 100),
          recurring: {
            interval:
              subscription.plan.billingPeriod === 'MONTHLY'
                ? 'month'
                : subscription.plan.billingPeriod === 'QUARTERLY'
                ? 'month'
                : 'year',
            interval_count: subscription.plan.billingPeriod === 'QUARTERLY' ? 3 : 1,
          },
          product_data: {
            name: `${issuer.name} · ${subscription.plan.name}`,
            description: `Socio: ${subscription.member.name}`,
          },
        },
      },
    ],
    success_url: `${appUrl}/?tab=contabilidad&success=true`,
    cancel_url: `${appUrl}/?tab=contabilidad&canceled=true`,
    subscription_data: {
      metadata: { subscriptionId: subscription.id, memberId: subscription.memberId },
      ...(connect.applicationFeePercent > 0
        ? { application_fee_percent: connect.applicationFeePercent }
        : {}),
    },
  }

  const requestOptions: Stripe.RequestOptions | undefined = connect.hasConnectedAccount
    ? { stripeAccount: connect.connectedAccountId }
    : undefined
  const session = await stripe.checkout.sessions.create(params, requestOptions)
  return session.url
}

export async function runReminderJob() {
  const today = startOfDay(new Date())
  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
    include: { member: true },
  })

  let sent = 0
  for (const invoice of invoices) {
    const diffDays = Math.floor((startOfDay(invoice.dueDate).getTime() - today.getTime()) / 86400000)
    let reminderType: string | null = null
    if (diffDays === 7) reminderType = 'D_MINUS_7'
    else if (diffDays === 2) reminderType = 'D_MINUS_2'
    else if (diffDays === -1) reminderType = 'D_PLUS_1'
    else if (diffDays === -7) reminderType = 'D_PLUS_7'

    if (!reminderType) continue

    const alreadySent = await prisma.reminderLog.findFirst({
      where: { invoiceId: invoice.id, reminderType },
    })
    if (alreadySent) continue

    const message = `Recordatorio de factura ${invoice.invoiceNumber}. Importe pendiente: ${(
      invoice.totalAmount - invoice.paidAmount
    ).toFixed(2)} ${invoice.currency}.`

    let status = 'SENT'
    let channel = 'EMAIL'
    try {
      const phone = (invoice.member.phone || '').replace(/[^\d+]/g, '')
      const cfg = await getWhatsAppConfig()
      const sessionId = String(cfg.linkedSessionId || '').trim()
      if (phone && sessionId) {
        let payLine = ''
        try {
          // Siempre por el generador: la caché por pasarela la gestiona él.
          const url = await createInvoiceStripeLink(invoice.id)
          if (url) payLine = ` Pagar: ${url}`
        } catch {
          /* optional */
        }
        await sendApiWassText({
          sessionId,
          phone,
          message: `${message}${payLine}`,
        })
        channel = 'WHATSAPP'
      } else if (process.env.REMINDER_WEBHOOK_URL) {
        await fetch(process.env.REMINDER_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberEmail: invoice.member.email,
            memberName: invoice.member.name,
            message,
          }),
        })
      }
    } catch {
      status = 'FAILED'
    }

    await prisma.reminderLog.create({
      data: {
        reminderType,
        channel,
        status,
        message,
        memberId: invoice.memberId,
        invoiceId: invoice.id,
      },
    })
    sent++
  }
  return { sent }
}


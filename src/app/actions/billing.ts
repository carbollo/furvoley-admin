'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getStripe } from '@/lib/stripe'

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

async function nextInvoiceNumber() {
  const year = new Date().getFullYear()
  const prefix = `FV-${year}-`
  const count = await prisma.invoice.count({
    where: { invoiceNumber: { startsWith: prefix } },
  })
  return `${prefix}${String(count + 1).padStart(5, '0')}`
}

export async function createMembershipPlan(data: {
  name: string
  description?: string
  amount: number
  billingPeriod: string
  enrollmentFee?: number
}) {
  const plan = await prisma.membershipPlan.create({
    data: {
      ...data,
      enrollmentFee: data.enrollmentFee ?? 0,
    },
  })
  revalidatePath('/billing')
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
    isActive?: boolean
  },
) {
  const plan = await prisma.membershipPlan.update({
    where: { id },
    data,
  })
  revalidatePath('/billing')
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

  revalidatePath('/billing')
}

export async function createSubscription(data: {
  memberId: string
  planId: string
  startDate?: Date
  autoPay?: boolean
}) {
  const plan = await prisma.membershipPlan.findUnique({ where: { id: data.planId } })
  if (!plan) throw new Error('Plan not found')

  const startDate = data.startDate ?? new Date()
  const subscription = await prisma.subscription.create({
    data: {
      memberId: data.memberId,
      planId: data.planId,
      startDate,
      nextInvoiceDate: startDate,
      autoPay: data.autoPay ?? false,
    },
  })

  // first invoice
  await createInvoiceForSubscription(subscription.id)
  revalidatePath('/billing')
  return subscription
}

export async function createInvoiceForSubscription(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, member: true },
  })
  if (!subscription) throw new Error('Subscription not found')

  const dueDate = addPeriod(subscription.nextInvoiceDate, subscription.plan.billingPeriod)
  const subtotal = subscription.plan.amount
  const taxAmount = 0
  const total = subtotal + taxAmount

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: await nextInvoiceNumber(),
      kind: 'MEMBERSHIP',
      issueDate: new Date(),
      dueDate,
      subtotal,
      taxAmount,
      totalAmount: total,
      memberId: subscription.memberId,
      subscriptionId: subscription.id,
      items: {
        create: [
          {
            description: `${subscription.plan.name} (${subscription.plan.billingPeriod})`,
            quantity: 1,
            unitAmount: subtotal,
            totalAmount: subtotal,
          },
        ],
      },
    },
  })

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { nextInvoiceDate: dueDate },
  })
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

  const created = []
  for (const subscription of dueSubscriptions) {
    const invoice = await createInvoiceForSubscription(subscription.id)
    created.push(invoice.id)
  }

  revalidatePath('/billing')
  return { createdCount: created.length }
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

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: await nextInvoiceNumber(),
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
  })

  revalidatePath('/billing')
  revalidatePath('/billing/extra-invoice')
  revalidatePath('/billing/impagos')
  return invoice
}

export async function runBillingAutomation() {
  const generated = await generateDueInvoices()
  await updateInvoiceStatuses()
  const reminders = await runReminderJob()
  revalidatePath('/billing')
  revalidatePath('/billing/impagos')
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
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'OVERDUE' },
      })
    }
  }
  revalidatePath('/billing')
  revalidatePath('/billing/impagos')
}

export async function recordInvoicePayment(data: {
  invoiceId: string
  amount: number
  method?: string
  status?: string
  stripePaymentIntent?: string
  stripeSessionId?: string
  errorMessage?: string
  bankReference?: string | null
}) {
  const invoice = await prisma.invoice.findUnique({ where: { id: data.invoiceId } })
  if (!invoice) throw new Error('Invoice not found')

  await prisma.paymentAttempt.create({
    data: {
      invoiceId: data.invoiceId,
      amount: data.amount,
      method: data.method ?? 'STRIPE',
      status: data.status ?? 'SUCCEEDED',
      stripePaymentIntent: data.stripePaymentIntent,
      stripeSessionId: data.stripeSessionId,
      errorMessage: data.errorMessage,
    },
  })

  if ((data.status ?? 'SUCCEEDED') === 'SUCCEEDED') {
    const paidAmount = invoice.paidAmount + data.amount
    const isPaid = paidAmount >= invoice.totalAmount
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount,
        status: isPaid ? 'PAID' : 'PARTIAL',
        paidAt: isPaid ? new Date() : null,
      },
    })

    const method = data.method ?? 'STRIPE'
    let source = 'INVOICE_PAYMENT'
    if (method === 'STRIPE') source = 'STRIPE'
    else if (method === 'BANK_TRANSFER') source = 'BANK_TRANSFER'
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
  }

  revalidatePath('/billing')
  revalidatePath('/billing/impagos')
  revalidatePath('/accounting')
  revalidatePath(`/billing/invoices/${data.invoiceId}`)
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

export async function createInvoiceStripeLink(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { member: true },
  })
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.stripeCheckoutUrl) return invoice.stripeCheckoutUrl

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const pendingAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount)
  if (pendingAmount <= 0) return null

  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    client_reference_id: invoice.id,
    metadata: {
      invoiceId: invoice.id,
      memberId: invoice.memberId,
      clubId: 'furvoley',
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: invoice.currency.toLowerCase(),
          unit_amount: Math.round(pendingAmount * 100),
          product_data: {
            name: `Factura ${invoice.invoiceNumber}`,
            description: `Socio: ${invoice.member.name}`,
          },
        },
      },
    ],
    success_url: `${appUrl}/billing/invoices/${invoice.id}?success=true`,
    cancel_url: `${appUrl}/billing/invoices/${invoice.id}?canceled=true`,
  })

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      stripeCheckoutUrl: session.url ?? null,
      stripeSessionId: session.id,
    },
  })
  revalidatePath(`/billing/invoices/${invoice.id}`)
  return session.url
}

export async function createSubscriptionStripeLink(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { member: true, plan: true },
  })
  if (!subscription) throw new Error('Subscription not found')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    client_reference_id: subscription.id,
    metadata: {
      subscriptionId: subscription.id,
      memberId: subscription.memberId,
      clubId: 'furvoley',
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
            name: `${subscription.plan.name} - ${subscription.member.name}`,
          },
        },
      },
    ],
    success_url: `${appUrl}/billing/subscriptions?success=true`,
    cancel_url: `${appUrl}/billing/subscriptions?canceled=true`,
  })
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
    try {
      if (process.env.REMINDER_WEBHOOK_URL) {
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
        channel: 'EMAIL',
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


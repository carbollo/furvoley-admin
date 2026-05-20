export type BillingPeriod = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

export function clampBillingDay(day: number): number {
  const n = Math.floor(Number(day))
  if (!Number.isFinite(n)) return 1
  return Math.min(28, Math.max(1, n))
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Fecha en el mes de `base` con día de cobro (ajusta si el mes es más corto). */
function dateOnBillingDay(base: Date, billingDay: number): Date {
  const day = clampBillingDay(billingDay)
  const y = base.getFullYear()
  const m = base.getMonth()
  const lastDay = new Date(y, m + 1, 0).getDate()
  const d = new Date(y, m, Math.min(day, lastDay))
  d.setHours(0, 0, 0, 0)
  return d
}

function addMonthsPreserveBillingDay(from: Date, months: number, billingDay: number): Date {
  const target = new Date(from.getFullYear(), from.getMonth() + months, 1)
  return dateOnBillingDay(target, billingDay)
}

/**
 * Próxima fecha de emisión de cuota >= hoy, alineada al día del plan.
 */
export function nextBillingDate(
  from: Date,
  billingDay: number,
  period: string,
): Date {
  const day = clampBillingDay(billingDay)
  const today = startOfDay(from)
  let candidate = dateOnBillingDay(today, day)
  if (candidate < today) {
    candidate = addMonthsPreserveBillingDay(today, 1, day)
  }
  return candidate
}

/**
 * Avanza al siguiente ciclo de facturación tras emitir una factura recurrente.
 */
export function advanceBillingDate(
  currentBillingDate: Date,
  billingDay: number,
  period: string,
): Date {
  const day = clampBillingDay(billingDay)
  const base = startOfDay(currentBillingDate)
  if (period === 'QUARTERLY') {
    return addMonthsPreserveBillingDay(base, 3, day)
  }
  if (period === 'YEARLY') {
    return addMonthsPreserveBillingDay(base, 12, day)
  }
  return addMonthsPreserveBillingDay(base, 1, day)
}

/** Vencimiento de la factura emitida en el ciclo (mismo día de cobro). */
export function billingDueDate(issueDate: Date, billingDay: number): Date {
  return dateOnBillingDay(startOfDay(issueDate), billingDay)
}

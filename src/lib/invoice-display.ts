/** Etiquetas y reglas de impago (CRM vs panel del socio). */

export type InvoiceLike = {
  status: string
  dueDate: Date | string
  totalAmount: number
  paidAmount: number
}

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function invoicePendingAmount(inv: InvoiceLike): number {
  return Math.max(0, inv.totalAmount - inv.paidAmount)
}

export function isUnpaidInvoice(inv: InvoiceLike): boolean {
  if (inv.status === 'PAID' || inv.status === 'VOID') return false
  return invoicePendingAmount(inv) > 0
}

/** True si la fecha de vencimiento es anterior a hoy (no pagó a tiempo). */
export function isInvoicePastDue(inv: InvoiceLike, today = new Date()): boolean {
  if (!isUnpaidInvoice(inv)) return false
  const due = startOfDay(new Date(inv.dueDate))
  const t = startOfDay(today)
  return due < t
}

/** CRM: socio con cuota impagada tras el día de cobro. */
export function memberIsDelinquentForCrm(
  memberInvoices: InvoiceLike[],
  today = new Date(),
): boolean {
  return memberInvoices.some(
    (inv) => inv.status === 'OVERDUE' || isInvoicePastDue(inv, today),
  )
}

/** Estado de factura en listados del CRM (Contabilidad). */
export function crmInvoiceEstado(
  inv: InvoiceLike,
  today = new Date(),
): 'Pagado' | 'Pago parcial' | 'Pendiente' | 'Vencido' {
  if (inv.status === 'PAID') return 'Pagado'
  if (inv.status === 'OVERDUE' || isInvoicePastDue(inv, today)) return 'Vencido'
  // Un cobro a medias no es lo mismo que no haber cobrado nada: sin este estado,
  // una factura de 60 € con 30 ya cobrados se leia igual que una intacta.
  if (inv.paidAmount > 0) return 'Pago parcial'
  return 'Pendiente'
}

export type MemberInvoiceBadge = {
  label: string
  tone: 'paid' | 'pending' | 'unpaid'
}

/** Panel del socio: tono amable, sin «Moroso». */
export function memberInvoiceBadge(inv: InvoiceLike, today = new Date()): MemberInvoiceBadge {
  if (inv.status === 'PAID') {
    return { label: 'Pagada', tone: 'paid' }
  }
  if (inv.status === 'VOID') {
    return { label: 'Anulada', tone: 'pending' }
  }
  if (inv.status === 'PARTIAL') {
    return { label: 'Pago parcial', tone: 'unpaid' }
  }
  if (inv.status === 'OVERDUE' || isInvoicePastDue(inv, today)) {
    return { label: 'Sin pagar', tone: 'unpaid' }
  }
  return { label: 'Pendiente', tone: 'pending' }
}

export const MEMBER_INVOICE_BADGE_STYLES: Record<
  MemberInvoiceBadge['tone'],
  { bg: string; color: string }
> = {
  paid: { bg: 'rgba(16,185,129,0.12)', color: '#047857' },
  pending: { bg: 'rgba(245,158,11,0.12)', color: '#b45309' },
  unpaid: { bg: 'rgba(239,68,68,0.12)', color: '#b91c1c' },
}

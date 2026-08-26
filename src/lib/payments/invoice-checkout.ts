import { getWhopClubConfig } from '@/lib/whop/club-config'
import { createWhopInvoiceCheckout } from '@/lib/whop/checkout'

export type InvoiceCheckoutResult = { ok: true; url: string } | { ok: false; error: string }

/**
 * Genera el enlace de pago de una factura con la pasarela del club.
 *
 * Punto único por el que pasan todos los cobros online: quien necesite un enlace
 * llama aquí y no habla con la pasarela directamente.
 */
export async function createInvoiceCheckoutUrl(invoiceId: string): Promise<InvoiceCheckoutResult> {
  const whop = await getWhopClubConfig()
  if (!whop.hasCompany) {
    return {
      ok: false,
      error: 'Todavía no has configurado la pasarela de cobro. Hazlo en Ajustes del club → Pasarela de cobro.',
    }
  }

  const r = await createWhopInvoiceCheckout(invoiceId)
  return r.ok ? { ok: true, url: r.url } : { ok: false, error: r.error }
}

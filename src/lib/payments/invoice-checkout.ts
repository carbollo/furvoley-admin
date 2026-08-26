import { getWhopClubConfig } from '@/lib/whop/club-config'
import { createWhopInvoiceCheckout } from '@/lib/whop/checkout'

export type InvoiceCheckoutResult = { ok: true; url: string } | { ok: false; error: string }

/**
 * Genera el enlace de pago de una factura con la pasarela ACTIVA del club.
 *
 * Punto único de conmutación entre pasarelas: si el club tiene la suya conectada
 * se usa esa; si no, se recurre a la integración antigua de Stripe. Cuando Stripe
 * se retire, aquí solo queda la rama nueva.
 */
export async function createInvoiceCheckoutUrl(invoiceId: string): Promise<InvoiceCheckoutResult> {
  const whop = await getWhopClubConfig()
  if (whop.hasCompany) {
    const r = await createWhopInvoiceCheckout(invoiceId)
    return r.ok ? { ok: true, url: r.url } : { ok: false, error: r.error }
  }

  // Legado: clubes que aún cobran con la integración anterior.
  const { createInvoiceCheckoutUrl: stripeCheckout } = await import('@/lib/stripe-checkout')
  return stripeCheckout(invoiceId)
}

'use client'

import { createInvoiceStripeLink } from '@/app/actions/billing'
import { useTransition } from 'react'

export function PayMyInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          const url = await createInvoiceStripeLink(invoiceId)
          if (url) window.location.href = url
        })
      }
      disabled={pending}
      style={{
        padding: '6px 14px',
        background: '#0058be',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 700,
        cursor: pending ? 'not-allowed' : 'pointer',
        opacity: pending ? 0.7 : 1,
        boxShadow: '0 1px 2px rgba(0,88,190,0.2)',
      }}
    >
      {pending ? 'Redirigiendo a Stripe…' : 'Pagar con Stripe'}
    </button>
  )
}

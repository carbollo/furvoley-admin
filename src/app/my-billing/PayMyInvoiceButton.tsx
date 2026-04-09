'use client'

import { createInvoiceStripeLink } from '@/app/actions/billing'
import { useTransition } from 'react'

export function PayMyInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const url = await createInvoiceStripeLink(invoiceId)
          if (url) window.open(url, '_blank')
        })
      }
      className="px-3 py-1 text-sm bg-indigo-600 text-white rounded"
      disabled={pending}
    >
      {pending ? 'Generando...' : 'Pagar'}
    </button>
  )
}


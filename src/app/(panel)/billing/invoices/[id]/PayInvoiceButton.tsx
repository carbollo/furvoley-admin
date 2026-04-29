'use client'

import { createInvoiceStripeLink } from '@/app/actions/billing'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export function PayInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const url = await createInvoiceStripeLink(invoiceId)
          if (url) window.open(url, '_blank')
          router.refresh()
        })
      }
      className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium disabled:opacity-50"
    >
      {pending ? 'Generando...' : 'Generar link Stripe'}
    </button>
  )
}


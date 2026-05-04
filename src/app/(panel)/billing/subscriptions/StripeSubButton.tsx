'use client'

import { createSubscriptionStripeLink } from '@/app/actions/billing'
import { useTransition } from 'react'

export function StripeSubButton({ subscriptionId }: { subscriptionId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const url = await createSubscriptionStripeLink(subscriptionId)
          if (url) window.open(url, '_blank')
        })
      }
      className="px-3 py-1 text-sm rounded bg-indigo-100 text-indigo-700"
      disabled={pending}
    >
      {pending ? 'Generando…' : 'Activar autopago'}
    </button>
  )
}


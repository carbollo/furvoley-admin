'use client'

import { useState } from 'react'
import { generateStripeLink } from '@/app/actions'
import { Link as LinkIcon, Copy, Check } from 'lucide-react'

export function StripeButton({ paymentId, stripeUrl }: { paymentId: string, stripeUrl: string | null }) {
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  if (stripeUrl) {
    return (
      <button 
        onClick={() => {
          navigator.clipboard.writeText(stripeUrl)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1 rounded-lg transition flex items-center space-x-1"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        <span>{copied ? 'Copiado' : 'Copiar Link'}</span>
      </button>
    )
  }

  return (
    <button 
      onClick={async () => {
        setLoading(true)
        try {
          await generateStripeLink(paymentId)
        } catch (error) {
          console.error(error)
        }
        setLoading(false)
      }}
      disabled={loading}
      className="text-sm font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1 rounded-lg transition flex items-center space-x-1 disabled:opacity-50"
    >
      <LinkIcon size={14} />
      <span>{loading ? 'Generando...' : 'Link Stripe'}</span>
    </button>
  )
}

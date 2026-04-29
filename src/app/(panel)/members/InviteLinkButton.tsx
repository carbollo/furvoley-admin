'use client'

import { useState, useTransition } from 'react'
import { Link2, Check } from 'lucide-react'
import { createSignupLink } from '@/app/actions/signup-links'

export function InviteLinkButton() {
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [lastLink, setLastLink] = useState<string | null>(null)

  const generate = () => {
    startTransition(async () => {
      const result = await createSignupLink()
      setLastLink(result.url)
      await navigator.clipboard.writeText(result.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={generate}
        disabled={pending}
        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2 transition disabled:opacity-60"
      >
        <Link2 size={18} />
        <span>{pending ? 'Generando...' : 'Crear enlace inscripción'}</span>
      </button>
      {copied && (
        <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">
          <Check size={14} /> Copiado
        </span>
      )}
      {lastLink && !copied && (
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(lastLink)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          className="text-sm text-indigo-700 underline"
        >
          Copiar último enlace
        </button>
      )}
    </div>
  )
}


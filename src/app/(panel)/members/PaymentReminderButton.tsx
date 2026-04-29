'use client'

import { useState, useTransition } from 'react'
import { sendWhatsAppPaymentReminders } from '@/app/actions'
import { MessageCircle } from 'lucide-react'

export function PaymentReminderButton() {
  const [pending, startTransition] = useTransition()
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={() =>
          startTransition(async () => {
            setResultMessage(null)
            setErrorMessage(null)
            try {
              const result = await sendWhatsAppPaymentReminders()
              setResultMessage(
                `Enviados: ${result.sent} | Fallidos: ${result.failed} | Sin teléfono: ${result.skippedNoPhone} | Socios con deuda: ${result.totalMembersInDebt}`,
              )
            } catch (error) {
              setErrorMessage(error instanceof Error ? error.message : 'Error enviando recordatorios')
            }
          })
        }
        disabled={pending}
        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2 transition disabled:opacity-60"
      >
        <MessageCircle size={18} />
        <span>{pending ? 'Enviando...' : 'Recordar cobros'}</span>
      </button>
      {resultMessage && <p className="text-xs text-emerald-700">{resultMessage}</p>}
      {errorMessage && <p className="text-xs text-rose-600">{errorMessage}</p>}
    </div>
  )
}


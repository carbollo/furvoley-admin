'use client'

import { useEffect, useState, useTransition } from 'react'
import { sendWhatsAppPaymentReminders } from '@/app/actions'
import { MessageCircle } from 'lucide-react'

export function PaymentReminderButton() {
  const [pending, startTransition] = useTransition()
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    if (!confirmando) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); setConfirmando(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmando])

  function enviar() {
    setConfirmando(false)
    startTransition(async () => {
            setResultMessage(null)
            setErrorMessage(null)
            try {
              const result = await sendWhatsAppPaymentReminders()
              if (result.error) {
                setErrorMessage(result.error)
                return
              }
              if (result.totalMembersInDebt === 0) {
                setResultMessage('No hay socios con facturas vencidas o pendientes de cobro.')
                return
              }
              setResultMessage(
                `Enviados: ${result.sent} | Fallidos: ${result.failed} | Sin teléfono: ${result.skippedNoPhone} | Socios con deuda: ${result.totalMembersInDebt}`,
              )
            } catch (error) {
              const msg = error instanceof Error ? error.message : ''
              setErrorMessage(
                msg && !msg.includes('Server Components render')
                  ? msg
                  : 'No se pudieron enviar los recordatorios. Revisa ApiWass (APIWASS_API_KEY y sesión vinculada en Ajustes).',
              )
            }
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        disabled={pending}
        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2 transition disabled:opacity-60"
      >
        <MessageCircle size={18} />
        <span>{pending ? 'Enviando…' : 'Recordar cobros'}</span>
      </button>
      {resultMessage && <p className="text-xs text-emerald-700">{resultMessage}</p>}
      {errorMessage && <p className="text-xs text-rose-600">{errorMessage}</p>}

      {/* Este botón manda mensajes al exterior, a familias reales, y no hay forma
          de recuperarlos. Es la única acción del módulo que sale del club. */}
      {confirmando && (
        <div
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmando(false) }}
          className="fixed inset-0 z-[1300] flex items-center justify-center p-5"
          style={{ background: 'rgba(15,23,42,0.5)' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="recordar-titulo"
            className="w-full max-w-md rounded-2xl bg-white p-6 text-left shadow-2xl"
          >
            <h2 id="recordar-titulo" className="text-lg font-bold text-stone-900">
              Enviar los avisos de cobro por WhatsApp
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-600">
              {'Se enviará un mensaje a cada socio con alguna factura sin pagar, ' +
               'incluidas las que aún no han vencido.\n\n' +
               'Los mensajes salen al momento y no se pueden retirar.'}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmando(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={enviar}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              >
                Enviar avisos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

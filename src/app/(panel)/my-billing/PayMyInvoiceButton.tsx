'use client'

import { useState, useTransition } from 'react'

export function PayMyInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <button
        type="button"
        onClick={() => {
          setError(null)
          startTransition(async () => {
            try {
              const r = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/checkout`, {
                method: 'POST',
                credentials: 'include',
              })
              const j = await r.json().catch(() => ({}))
              if (!r.ok) {
                // Los mensajes del servidor están escritos para el tesorero
                // («configúrala en Ajustes del club», «genera una clave nueva
                // con rol Admin»): al socio no le dicen nada y le asustan.
                setError(
                  r.status === 400
                    ? 'Ahora mismo no se puede pagar online. Avisa a tu club para que lo revise.'
                    : 'No se pudo iniciar el pago. Inténtalo de nuevo en un momento.',
                )
                return
              }
              if (typeof j.url === 'string' && j.url.startsWith('https://')) {
                window.location.href = j.url
                return
              }
              setError('No se pudo obtener un enlace de pago válido. Avisa a tu club.')
            } catch {
              setError('Error de conexión. Comprueba tu red e inténtalo de nuevo.')
            }
          })
        }}
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
        {pending ? 'Abriendo el pago…' : 'Pagar ahora'}
      </button>
      {error ? (
        <span style={{ fontSize: 11, color: '#b91c1c', maxWidth: 220, lineHeight: 1.35 }}>{error}</span>
      ) : null}
    </div>
  )
}

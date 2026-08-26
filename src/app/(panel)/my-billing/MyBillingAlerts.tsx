'use client'

import { useSearchParams } from 'next/navigation'

const PRIMARY = '#0058be'

export function MyBillingAlerts() {
  const searchParams = useSearchParams()
  // La pasarela devuelve al socio con ?pago=ok o ?alta=ok (ver returnUrl en
  // src/lib/whop/checkout.ts). Este aviso buscaba ?success=true, que no lo
  // manda nadie: quien acababa de pagar volvía a una pantalla muda que además
  // seguía mostrando su factura como pendiente.
  const success =
    searchParams.get('pago') === 'ok' ||
    searchParams.get('alta') === 'ok' ||
    searchParams.get('success') === 'true'
  const canceled =
    searchParams.get('pago') === 'ko' ||
    searchParams.get('canceled') === 'true'

  if (!success && !canceled) return null

  return (
    <div
      style={{
        marginBottom: 24,
        padding: '14px 18px',
        borderRadius: 12,
        background: success ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.12)',
        border: `1px solid ${success ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)'}`,
        color: success ? '#047857' : '#b45309',
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {success
        ? 'Pago recibido. Tu recibo tarda unos segundos en aparecer como pagado: si sigue pendiente, pulsa Actualizar.'
        : 'No se ha completado el pago, así que no se te ha cobrado nada. Puedes intentarlo de nuevo cuando quieras.'}
      <a
        href="/my-billing"
        style={{
          marginLeft: 12,
          color: PRIMARY,
          fontWeight: 700,
          textDecoration: 'underline',
        }}
      >
        Actualizar
      </a>
    </div>
  )
}

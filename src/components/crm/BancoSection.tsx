'use client'

import { useCallback, useEffect, useState } from 'react'
import { PayoutsPanel, type PayoutsState, type SupportedMethod } from './PayoutsPanel'

/**
 * Contabilidad → Banco.
 *
 * Reúne en un sitio todo lo que tiene que ver con el dinero real del club: lo
 * que la pasarela le debe, la cuenta donde lo recibe, cuándo se le transfiere y
 * el extracto que luego hay que cuadrar.
 *
 * Antes estaba repartido: los saldos y la cuenta bancaria vivían dentro del
 * modal de Ajustes del club —que no es donde nadie busca su dinero— y el
 * extracto solo se alcanzaba por una entrada suelta del menú.
 */
export function BancoSection({
  showAlert,
  countryHint,
  whopConectado,
  onConfigurarPasarela,
}: {
  showAlert: (message: string, title?: string) => void
  /** País del club, para pedirle a la pasarela los campos bancarios correctos. */
  countryHint: string
  whopConectado: boolean
  onConfigurarPasarela?: () => void
}) {
  const [payouts, setPayouts] = useState<PayoutsState | null>(null)
  const [busy, setBusy] = useState(false)
  const [bankMethods, setBankMethods] = useState<SupportedMethod[] | null>(null)
  const [bankFields, setBankFields] = useState<Record<string, string>>({})
  const [bankMethodId, setBankMethodId] = useState('')
  const [bankCountry, setBankCountry] = useState('')

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/crm/whop/payouts', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) return
      setPayouts(await r.json())
    } catch {
      /* la pantalla avisa si no hay datos */
    }
  }, [])

  useEffect(() => {
    if (whopConectado) void cargar()
  }, [cargar, whopConectado])

  /** Los campos concretos solo llegan al pedir un método en particular. */
  async function elegirMetodo(country: string, methodId: string, conocidos: SupportedMethod[]) {
    const r = await fetch(
      `/api/crm/whop/payouts/methods?country=${encodeURIComponent(country)}&methodId=${encodeURIComponent(methodId)}`,
      { credentials: 'include' },
    )
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.methods?.[0]) {
      showAlert(j.error || 'No se pudieron consultar los datos que pide esa forma de cobro')
      return
    }
    const full: SupportedMethod = j.methods[0]
    setBankMethods(conocidos.map((m) => (m.id === full.id ? full : m)))
    setBankMethodId(full.id)
    setBankFields({})
  }

  async function abrirFormularioBanco(country: string) {
    setBusy(true)
    setBankCountry(country)
    try {
      const r = await fetch(`/api/crm/whop/payouts/methods?country=${encodeURIComponent(country)}`, {
        credentials: 'include',
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudieron consultar las formas de cobro')
        return
      }
      const methods: SupportedMethod[] = j.methods || []
      setBankMethods(methods)
      // Se preselecciona la transferencia bancaria si la hay: es lo que quiere un
      // club, no una tarjeta ni un envío instantáneo con más comisión.
      const preferida =
        methods.find((m) => /bank|sepa|transfer|ach/i.test(`${m.name} ${m.deliveryType}`)) || methods[0]
      if (preferida) await elegirMetodo(country, preferida.id, methods)
    } finally {
      setBusy(false)
    }
  }

  async function cambiarMetodo(methodId: string) {
    if (busy || !bankMethods) return
    setBusy(true)
    try {
      await elegirMetodo(bankCountry, methodId, bankMethods)
    } finally {
      setBusy(false)
    }
  }

  async function guardarCuenta() {
    if (busy || !bankMethodId) return
    setBusy(true)
    try {
      const r = await fetch('/api/crm/whop/payouts/methods', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supportedMethodId: bankMethodId, fields: bankFields }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudo guardar la cuenta bancaria')
        return
      }
      setBankMethods(null)
      setBankFields({})
      await cargar()
      showAlert('Cuenta bancaria guardada. A partir de ahora recibirás ahí los cobros.')
    } finally {
      setBusy(false)
    }
  }

  async function transferirAhora(currency?: string) {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/crm/whop/payouts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudo enviar la transferencia')
        return
      }
      await cargar()
      const enviadas: { amount: number; currency: string }[] = j.transfers || []
      showAlert(
        j.skipped
          ? `No se ha transferido nada: ${j.reason}.`
          : enviadas.length === 0
            ? 'No había saldo que transferir.'
            : `Transferencia enviada: ${enviadas.map((t) => `${t.amount} ${t.currency}`).join(' + ')}. ` +
              'Llegará a tu banco en unos días.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function guardarProgramacion(patch: { frequency?: string; minAmount?: number }) {
    setBusy(true)
    try {
      const r = await fetch('/api/crm/whop/payouts/config', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!r.ok) {
        showAlert((await r.json().catch(() => ({}))).error || 'No se pudo guardar')
        return
      }
      await cargar()
    } finally {
      setBusy(false)
    }
  }

  const tarjeta: React.CSSProperties = {
    padding: 24,
    borderRadius: 12,
    background: 'var(--surface-card)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--card-shadow)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {!whopConectado ? (
        <div style={tarjeta}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
            Todavía no cobras online
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.55 }}>
            Cuando conectes la pasarela de cobro verás aquí cuánto has cobrado, podrás decirle a qué
            cuenta bancaria mandarlo y cada cuánto quieres recibirlo.
          </p>
          {onConfigurarPasarela && (
            <button
              type="button"
              onClick={onConfigurarPasarela}
              style={{
                padding: '10px 18px', borderRadius: 8, border: 'none',
                background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              }}
            >
              Configurar la pasarela de cobro
            </button>
          )}
        </div>
      ) : (
        <PayoutsPanel
          data={payouts}
          busy={busy}
          bankMethods={bankMethods}
          bankMethodId={bankMethodId}
          bankFields={bankFields}
          countryHint={countryHint}
          onLoad={cargar}
          onStartBank={abrirFormularioBanco}
          onCancelBank={() => { setBankMethods(null); setBankFields({}) }}
          onChangeMethod={cambiarMetodo}
          onFieldChange={(id, value) => setBankFields((f) => ({ ...f, [id]: value }))}
          onSaveBank={guardarCuenta}
          onTransferNow={transferirAhora}
          onSweepChange={guardarProgramacion}
        />
      )}

      <div style={tarjeta}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Extracto bancario</div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.55 }}>
          Sube el CSV de tu banco para cuadrar lo que ha entrado con las facturas que emitiste. Al
          conciliar un ingreso con su factura, esa factura queda cobrada y el socio deja de figurar
          como moroso.
        </p>
        <a
          href="/accounting/bank-import"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface-card)',
            color: 'var(--accent)', textDecoration: 'none',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
          }}
        >
          Abrir el extracto bancario →
        </a>
      </div>
    </div>
  )
}

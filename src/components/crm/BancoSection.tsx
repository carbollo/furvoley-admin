'use client'

import { useCallback, useState } from 'react'
import { PayoutsPanel, type PayoutsState, type SupportedMethod } from './PayoutsPanel'
import { CardsPanel, type CardApplication, type CardsState } from './CardsPanel'

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
  esAdmin,
  onConfigurarPasarela,
}: {
  showAlert: (message: string, title?: string) => void
  /** País del club, para pedirle a la pasarela los campos bancarios correctos. */
  countryHint: string
  /** `null` cuando no se ha podido comprobar: no es lo mismo que «no conectada». */
  whopConectado: boolean | null
  /** El tesorero mira; emitir o congelar una tarjeta es cosa del ADMIN. */
  esAdmin: boolean
  onConfigurarPasarela?: () => void
}) {
  const [payouts, setPayouts] = useState<PayoutsState | null>(null)
  const [busy, setBusy] = useState(false)
  const [bankMethods, setBankMethods] = useState<SupportedMethod[] | null>(null)
  const [bankFields, setBankFields] = useState<Record<string, string>>({})
  const [bankMethodId, setBankMethodId] = useState('')
  const [bankCountry, setBankCountry] = useState('')
  const [cards, setCards] = useState<CardsState | null>(null)
  const [cardsBusy, setCardsBusy] = useState(false)
  /** Alta de tarjetas a medias: tiene que quedarse en pantalla, no en un aviso. */
  const [solicitud, setSolicitud] = useState<CardApplication | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/crm/whop/payouts', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) {
        // Antes se salia en silencio y la pantalla se quedaba en «Consultando tu
        // saldo…» indefinidamente, que parece que sigue cargando cuando en
        // realidad ya no va a llegar nada.
        setPayouts({
          connected: true,
          balances: [],
          balancesError:
            r.status === 401
              ? 'Tu sesión ha caducado. Vuelve a entrar para ver tu saldo.'
              : 'No se pudo consultar tu saldo. Vuelve a intentarlo en un momento.',
          methods: [],
          payouts: [],
          payoutsError: null,
          pending: [],
          sweep: { frequency: 'OFF', minAmount: 10, lastSweepAt: null, hasPayoutMethod: false, currency: 'EUR' },
        })
        return
      }
      setPayouts(await r.json())
    } catch {
      setPayouts({
        connected: true,
        balances: [],
        balancesError: 'No hay conexión con el servidor. Comprueba tu red y vuelve a intentarlo.',
        methods: [],
        payouts: [],
        payoutsError: null,
        pending: [],
        sweep: { frequency: 'OFF', minAmount: 10, lastSweepAt: null, hasPayoutMethod: false, currency: 'EUR' },
      })
    }
  }, [])

  // El propio PayoutsPanel llama a `onLoad` al montarse, asi que aqui no se pide
  // nada: hacerlo en los dos sitios duplicaba la carga (y con ella tres llamadas
  // a la pasarela) cada vez que se abria Banco.

  const vacio = (error: string): CardsState => ({
    cards: [],
    cardsError: error,
    movements: [],
    movementsError: null,
    holders: [],
    scopes: [],
  })

  const cargarTarjetas = useCallback(async () => {
    try {
      const r = await fetch('/api/crm/whop/cards', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) {
        // Sin esto el panel se quedaba en «Consultando tus tarjetas…» para
        // siempre, que es la peor forma de fallar: parece que sigue cargando.
        setCards(
          vacio(
            r.status === 401
              ? 'Tu sesión ha caducado. Vuelve a entrar para ver las tarjetas.'
              : 'No se pudieron consultar las tarjetas. Vuelve a intentarlo en un momento.',
          ),
        )
        return
      }
      setCards(await r.json())
    } catch {
      setCards(vacio('No hay conexión con el servidor. Comprueba tu red y vuelve a intentarlo.'))
    }
  }, [])

  async function emitirTarjeta(input: {
    name: string
    spendLimit: number | null
    spendLimitFrequency: string
    assignedUserId: string | null
    requestId: string
  }): Promise<'ok' | 'rechazado' | 'indeterminado'> {
    if (cardsBusy) return 'rechazado'
    setCardsBusy(true)
    try {
      const r = await fetch('/api/crm/whop/cards', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        // Indeterminado: la petición pudo llegar igualmente. Se refresca antes
        // de que el club vuelva a pulsar, para que no emita dos.
        if (j.indeterminate) {
          await cargarTarjetas()
          showAlert(
            `${j.error || 'No se pudo confirmar la emisión'}. Puede que la tarjeta se haya emitido igualmente: ` +
              'mira la lista antes de volver a intentarlo.',
          )
          return 'indeterminado'
        }
        showAlert(j.error || 'No se pudo emitir la tarjeta')
        return 'rechazado'
      }
      await cargarTarjetas()
      if (j.kind === 'application') {
        // Esto NO es una tarjeta: es una solicitud de alta. El enlace es la
        // única forma de terminarla, así que se queda fijo en la pantalla.
        setSolicitud({ status: String(j.applicationStatus || 'pending'), hostedUrl: j.hostedUrl || null })
        showAlert(
          'Antes de darte tarjetas, la pasarela tiene que aprobar al club. Arriba te queda el enlace para terminarlo.',
        )
        return 'ok'
      }
      showAlert(
        j.kind === 'invitation'
          ? 'Se ha invitado al titular. La tarjeta no existirá hasta que complete su alta en la pasarela.'
          : j.kind === 'provisioning'
            ? 'La pasarela está emitiendo la tarjeta. Aparecerá en la lista en unos segundos.'
            : 'Tarjeta emitida. Ya puedes usarla.',
      )
      return 'ok'
    } catch {
      // Un corte de red deja la emisión en el aire igual que un timeout: no se
      // sabe si la tarjeta existe, así que el reintento tiene que conservar la
      // clave de idempotencia en vez de estrenar una.
      await cargarTarjetas()
      showAlert(
        'Se perdió la conexión al emitir la tarjeta. Puede que se haya emitido igualmente: mira la lista antes de volver a intentarlo.',
      )
      return 'indeterminado'
    } finally {
      setCardsBusy(false)
    }
  }

  async function cambiarTarjeta(
    cardId: string,
    patch: {
      frozen?: boolean
      canceled?: boolean
      spendLimit?: number | null
      transactionLimit?: number | null
      removeLimit?: boolean
      spendLimitFrequency?: string
    },
  ): Promise<boolean> {
    if (cardsBusy) return false
    setCardsBusy(true)
    try {
      const r = await fetch(`/api/crm/whop/cards/${encodeURIComponent(cardId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        // Cancelar no tiene vuelta atras: si no se sabe si se aplico, hay que
        // decirlo y refrescar, no afirmar que no se hizo.
        if (j.indeterminate) {
          await cargarTarjetas()
          showAlert(
            `${j.error || 'No se pudo confirmar el cambio'}. Puede que se haya aplicado igualmente: comprueba el estado en la lista.`,
          )
          return false
        }
        showAlert(j.error || 'No se pudo cambiar la tarjeta')
        return false
      }
      await cargarTarjetas()
      return true
    } catch {
      showAlert('No hay conexión con el servidor. Comprueba si el cambio se ha aplicado.')
      await cargarTarjetas()
      return false
    } finally {
      setCardsBusy(false)
    }
  }

  /** Tope por defecto de las tarjetas nuevas. Va por la misma ruta que el resto
   * de la configuración de dinero del club. */
  async function guardarTope(patch: {
    cardDefaultLimit: number | null
    cardDefaultLimitPeriod?: string
  }): Promise<boolean> {
    setCardsBusy(true)
    try {
      const r = await fetch('/api/crm/whop/payouts/config', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!r.ok) {
        showAlert((await r.json().catch(() => ({}))).error || 'No se pudo guardar el tope')
        return false
      }
      await cargarTarjetas()
      return true
    } catch {
      showAlert('No hay conexión con el servidor.')
      return false
    } finally {
      setCardsBusy(false)
    }
  }

  /**
   * El número completo no pasa por el estado compartido ni se guarda: se pide,
   * se devuelve a quien lo pintó y ahí muere.
   */
  async function verDatosTarjeta(cardId: string) {
    try {
      const r = await fetch(`/api/crm/whop/cards/${encodeURIComponent(cardId)}/secrets`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudieron consultar los datos de la tarjeta')
        return null
      }
      return j as { cardNumber: string; cvc: string; nameOnCard: string | null; expiration: string | null }
    } catch {
      showAlert('No se pudieron consultar los datos de la tarjeta')
      return null
    }
  }

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

  async function guardarProgramacion(patch: {
    frequency?: string
    minAmount?: number
    treasurerCanTransfer?: boolean
  }) {
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
      {whopConectado === null ? (
        <div style={tarjeta}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
            No se ha podido comprobar tu pasarela
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
            Vuelve a cargar la página en un momento. No toques nada de la pasarela hasta saber su
            estado: reconectarla reinicia dónde recibes el dinero.
          </p>
        </div>
      ) : !whopConectado ? (
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
          esAdmin={esAdmin}
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

      {whopConectado && (
        <CardsPanel
          data={cards}
          busy={cardsBusy}
          esAdmin={esAdmin}
          solicitud={solicitud}
          onLoad={cargarTarjetas}
          onCreate={emitirTarjeta}
          onUpdate={cambiarTarjeta}
          onRevealSecrets={verDatosTarjeta}
          onTopeChange={guardarTope}
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

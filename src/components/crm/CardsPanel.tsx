'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatMoney } from '@/lib/format-money'
import { Field, Section, inputStyle, primaryBtnStyle, secondaryBtnStyle } from './PayoutsPanel'

/**
 * Las tarjetas del club dentro de Contabilidad → Banco.
 *
 * Sirve para gastar el saldo sin esperar a la transferencia al banco. Lo que
 * más cuesta explicar de esto es que la tarjeta liquida en dólares aunque el
 * club lleve euros, así que en pantalla se enseña siempre lo que cobró el
 * comercio en su divisa y, debajo, lo que se descontó de la tarjeta.
 */

export type ClubCard = {
  id: string
  name: string
  last4: string | null
  status: 'active' | 'frozen' | 'canceled' | 'invited' | 'denied' | 'unknown'
  type: 'virtual' | 'physical' | 'unknown'
  limitAmount: number | null
  limitFrequency: 'daily' | 'weekly' | 'monthly' | 'one_time' | 'per_transaction' | null
  spentLastMonth: number
  expiration: string | null
  userId: string | null
  createdAt: string | null
  canceledAt: string | null
}

export type CardMovement = {
  id: string
  cardId: string
  date: string
  localAmount: number | null
  localCurrency: string | null
  usdAmount: number | null
  status: 'pending' | 'completed' | 'reversed' | 'declined' | 'unknown'
  merchant: string
  merchantIconUrl: string | null
  category: string | null
  declinedReason: string | null
  international: boolean
}

export type CardsState = {
  cards: ClubCard[]
  cardsError: string | null
  movements: CardMovement[]
  movementsError: string | null
  holders: { userId: string; name: string; role: string; pending: boolean }[]
  scopes: { action: string; label: string; granted: boolean }[]
  hayMasMovimientos?: boolean
}

/** Solicitud de alta abierta por la pasarela: hay que terminarla fuera del CRM. */
export type CardApplication = { status: string; hostedUrl: string | null }

const ESTADO_TARJETA: Record<ClubCard['status'], { texto: string; color: string }> = {
  active: { texto: 'Activa', color: 'var(--green, #16a34a)' },
  frozen: { texto: 'Congelada', color: 'var(--amber, #d97706)' },
  canceled: { texto: 'Cancelada', color: 'var(--text-muted)' },
  invited: { texto: 'Esperando al titular', color: 'var(--amber, #d97706)' },
  denied: { texto: 'Denegada', color: 'var(--red, #dc2626)' },
  unknown: { texto: 'Estado desconocido', color: 'var(--text-muted)' },
}

const ESTADO_MOV: Record<CardMovement['status'], string> = {
  pending: 'Pendiente de confirmar',
  completed: 'Cobrado',
  reversed: 'Devuelto',
  declined: 'Rechazado',
  unknown: '—',
}

const PERIODO: Record<string, string> = {
  daily: 'al día',
  weekly: 'a la semana',
  monthly: 'al mes',
  one_time: 'en total',
  per_transaction: 'por compra',
}

const ESTADO_SOLICITUD: Record<string, string> = {
  pending: 'La pasarela está revisando la solicitud.',
  manual_review: 'Una persona de la pasarela está revisando la solicitud a mano.',
  needs_verification: 'Falta verificar la identidad del titular.',
  needs_information: 'La pasarela pide más datos para seguir.',
  approved: 'Solicitud aprobada. Vuelve a emitir la tarjeta.',
  denied: 'La pasarela ha denegado las tarjetas a esta cuenta.',
  locked: 'La solicitud está bloqueada. Contacta con la pasarela.',
  canceled: 'La solicitud se ha cancelado.',
}

function usd(n: number): string {
  return formatMoney(n, 'USD')
}

/** Lo que cobró el comercio; si no viene, se cae a la cifra en dólares. */
function importeComercio(m: CardMovement): string {
  if (m.localAmount != null && m.localCurrency) return formatMoney(m.localAmount, m.localCurrency)
  return m.usdAmount == null ? '—' : usd(m.usdAmount)
}

function fecha(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

/** Identificador de un intento de emisión. Es lo que evita emitir dos veces. */
function nuevoIntento(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // Contextos sin randomUUID: sirve cualquier cosa con la forma de un UUID,
    // porque solo tiene que ser distinta entre intentos.
    const h = '0123456789abcdef'
    const r = (n: number) => Array.from({ length: n }, () => h[Math.floor(Math.random() * 16)]).join('')
    return `${r(8)}-${r(4)}-${r(4)}-${r(4)}-${r(12)}`
  }
}

export function CardsPanel({
  data,
  busy,
  esAdmin,
  solicitud,
  onLoad,
  onCreate,
  onUpdate,
  onRevealSecrets,
}: {
  data: CardsState | null
  busy: boolean
  esAdmin: boolean
  solicitud: CardApplication | null
  onLoad: () => void
  onCreate: (input: {
    name: string
    spendLimit: number | null
    spendLimitFrequency: string
    assignedUserId: string | null
    requestId: string
  }) => Promise<'ok' | 'rechazado' | 'indeterminado'>
  onUpdate: (
    cardId: string,
    patch: {
      frozen?: boolean
      canceled?: boolean
      spendLimit?: number | null
      transactionLimit?: number | null
      removeLimit?: boolean
      spendLimitFrequency?: string
    },
  ) => Promise<boolean>
  onRevealSecrets: (
    cardId: string,
  ) => Promise<{ cardNumber: string; cvc: string; nameOnCard: string | null; expiration: string | null } | null>
}) {
  const [nueva, setNueva] = useState(false)
  const [nombre, setNombre] = useState('')
  const [limite, setLimite] = useState('')
  const [periodo, setPeriodo] = useState('monthly')
  const [titular, setTitular] = useState('')
  const [intento, setIntento] = useState(nuevoIntento)
  /** Tarjeta cuyo botón de cancelar espera confirmación. */
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [editandoLimite, setEditandoLimite] = useState<string | null>(null)
  const [nuevoLimite, setNuevoLimite] = useState('')
  const [nuevoPeriodo, setNuevoPeriodo] = useState('monthly')
  const [revelando, setRevelando] = useState<string | null>(null)
  const [secretos, setSecretos] = useState<
    { cardId: string; cardNumber: string; cvc: string; nameOnCard: string | null; expiration: string | null } | null
  >(null)

  useEffect(() => {
    onLoad()
  }, [onLoad])

  // El número no se queda en pantalla indefinidamente: si alguien deja el
  // portátil abierto, a los dos minutos ya no hay nada que leer.
  useEffect(() => {
    if (!secretos) return
    const t = window.setTimeout(() => setSecretos(null), 120_000)
    return () => window.clearTimeout(t)
  }, [secretos])

  const cerrarFormulario = useCallback(() => {
    setNueva(false)
    setNombre('')
    setLimite('')
    setTitular('')
  }, [])

  const cardStyle: React.CSSProperties = {
    padding: 20,
    borderRadius: 12,
    background: 'var(--surface-card)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  }

  const faltanPermisos = (data?.scopes || []).filter((s) => !s.granted)
  const puedeGestionar = esAdmin && faltanPermisos.length === 0
  const cards = data?.cards || []
  const nombreTarjeta = (id: string) => {
    const c = cards.find((x) => x.id === id)
    if (!c) return null
    return c.last4 ? `${c.name} ····${c.last4}` : c.name
  }

  return (
    <Section
      title="Tarjetas"
      subtitle="Para gastar el saldo del club directamente, sin esperar a la transferencia."
    >
      <div style={cardStyle}>
        {data?.cardsError ? (
          <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>{data.cardsError}</div>
        ) : null}

        {solicitud ? (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              border: '1px solid var(--amber, #d97706)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Falta terminar el alta de tarjetas</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {ESTADO_SOLICITUD[solicitud.status] ||
                'La pasarela ha abierto una solicitud para poder darte tarjetas.'}
            </div>
            {solicitud.hostedUrl ? (
              <a
                href={solicitud.hostedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}
              >
                Continuar con la verificación →
              </a>
            ) : null}
          </div>
        ) : null}

        {esAdmin && faltanPermisos.length > 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            Puedes ver las tarjetas y sus gastos, pero no emitirlas ni congelarlas: la clave de la
            pasarela se generó sin los permisos{' '}
            <strong>{faltanPermisos.map((s) => s.label).join(' y ')}</strong>. Genera una clave nueva
            con esos permisos marcados y vuelve a conectarla en Ajustes del club.
          </div>
        ) : null}

        {!data ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Consultando tus tarjetas…</div>
        ) : data.cardsError ? null : cards.length === 0 ? (
          <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            Todavía no tienes ninguna tarjeta. Con una puedes pagar los gastos del club —material,
            desplazamientos, arbitrajes— con lo que ya has cobrado, en vez de esperar a que llegue a
            tu banco.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cards.map((c) => {
              const estado = ESTADO_TARJETA[c.status]
              const cancelada = c.status === 'canceled'
              const verSecretos = secretos?.cardId === c.id
              return (
                <div
                  key={c.id}
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: cancelada ? 'transparent' : 'var(--surface-low)',
                    opacity: cancelada ? 0.6 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</span>
                    <span
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {c.last4 ? `•••• ${c.last4}` : 'sin número todavía'}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: estado.color }}>
                      {estado.texto}
                    </span>
                    {c.expiration ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Caduca {c.expiration}</span>
                    ) : null}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: 12.5 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Gastado en 30 días:{' '}
                      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(c.spentLastMonth)}</strong>
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {c.limitAmount == null
                        ? 'Sin límite de gasto'
                        : `Límite: ${usd(c.limitAmount)} ${PERIODO[c.limitFrequency || 'monthly'] || ''}`}
                    </span>
                  </div>

                  {verSecretos && secretos ? (
                    <div
                      role="status"
                      aria-live="polite"
                      aria-label="Datos de la tarjeta"
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        border: '1px solid var(--amber, #d97706)',
                        background: 'var(--surface-card)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: 16,
                          letterSpacing: '0.06em',
                          userSelect: 'all',
                        }}
                      >
                        {secretos.cardNumber}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 16 }}>
                        <span>
                          CVC <strong style={{ userSelect: 'all' }}>{secretos.cvc}</strong>
                        </span>
                        {secretos.expiration ? <span>Caduca {secretos.expiration}</span> : null}
                        {secretos.nameOnCard ? <span>{secretos.nameOnCard}</span> : null}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: 11.5,
                          color: 'var(--text-muted)',
                        }}
                      >
                        <span>Se oculta solo en dos minutos. No lo dejes a la vista.</span>
                        {/* Ocultar tiene que poder hacerse SIEMPRE, aunque la
                            tarjeta deje de estar activa mientras está a la vista:
                            si el botón dependiera del estado, el número podría
                            quedarse pintado sin forma de quitarlo. */}
                        <button type="button" onClick={() => setSecretos(null)} style={secondaryBtnStyle(false)}>
                          Ocultar ahora
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {confirmando === c.id ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 12.5,
                        color: 'var(--red, #dc2626)',
                      }}
                    >
                      <span>Cancelar la tarjeta es definitivo: no se puede reactivar.</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          const ok = await onUpdate(c.id, { canceled: true })
                          if (ok) setConfirmando(null)
                        }}
                        style={{ ...secondaryBtnStyle(busy), color: 'var(--red, #dc2626)' }}
                      >
                        Sí, cancelarla
                      </button>
                      <button type="button" onClick={() => setConfirmando(null)} style={secondaryBtnStyle(false)}>
                        Dejarlo
                      </button>
                    </div>
                  ) : editandoLimite === c.id ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                      <input
                        type="number"
                        min={1}
                        step="1"
                        value={nuevoLimite}
                        onChange={(e) => setNuevoLimite(e.target.value)}
                        placeholder="Importe en USD"
                        aria-label={`Límite de gasto de ${c.name}, en dólares`}
                        style={{ ...inputStyle, width: 160 }}
                      />
                      {/* El periodo va aquí porque la pasarela lo exige junto al
                          importe: sin ofrecerlo, cambiar la cifra de un tope
                          diario lo habría convertido en mensual sin avisar. */}
                      <select
                        value={nuevoPeriodo}
                        onChange={(e) => setNuevoPeriodo(e.target.value)}
                        aria-label="Cada cuánto se aplica el límite"
                        style={{ ...inputStyle, width: 170 }}
                      >
                        <option value="monthly">al mes</option>
                        <option value="weekly">a la semana</option>
                        <option value="daily">al día</option>
                        <option value="one_time">en total</option>
                        <option value="per_transaction">por compra</option>
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          const n = Number(nuevoLimite)
                          const patch =
                            n > 0
                              ? nuevoPeriodo === 'per_transaction'
                                ? { transactionLimit: n }
                                : { spendLimit: n, spendLimitFrequency: nuevoPeriodo }
                              : { removeLimit: true }
                          const ok = await onUpdate(c.id, patch)
                          if (ok) setEditandoLimite(null)
                        }}
                        style={primaryBtnStyle(busy)}
                      >
                        {Number(nuevoLimite) > 0 ? 'Guardar límite' : 'Dejarla sin límite'}
                      </button>
                      <button type="button" onClick={() => setEditandoLimite(null)} style={secondaryBtnStyle(false)}>
                        Cancelar
                      </button>
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        Déjalo vacío o en cero para quitar el límite.
                      </span>
                    </div>
                  ) : puedeGestionar && !cancelada ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <button
                        type="button"
                        disabled={busy || revelando !== null || c.status !== 'active'}
                        onClick={async () => {
                          if (verSecretos) {
                            setSecretos(null)
                            return
                          }
                          setRevelando(c.id)
                          try {
                            const s = await onRevealSecrets(c.id)
                            if (s) setSecretos({ cardId: c.id, ...s })
                          } finally {
                            setRevelando(null)
                          }
                        }}
                        style={secondaryBtnStyle(busy || revelando !== null || c.status !== 'active')}
                      >
                        {verSecretos ? 'Ocultar datos' : revelando === c.id ? 'Consultando…' : 'Ver datos'}
                      </button>
                      <button
                        type="button"
                        disabled={busy || (c.status !== 'active' && c.status !== 'frozen')}
                        onClick={() => onUpdate(c.id, { frozen: c.status !== 'frozen' })}
                        style={secondaryBtnStyle(busy || (c.status !== 'active' && c.status !== 'frozen'))}
                      >
                        {c.status === 'frozen' ? 'Descongelar' : 'Congelar'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditandoLimite(c.id)
                          setNuevoLimite(c.limitAmount == null ? '' : String(c.limitAmount))
                          setNuevoPeriodo(c.limitFrequency || 'monthly')
                        }}
                        style={secondaryBtnStyle(busy)}
                      >
                        Límite
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmando(c.id)}
                        style={{ ...secondaryBtnStyle(busy), color: 'var(--red, #dc2626)' }}
                      >
                        Cancelar tarjeta
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        {puedeGestionar && !nueva ? (
          <div>
            <button type="button" onClick={() => setNueva(true)} style={primaryBtnStyle(busy)} disabled={busy}>
              Emitir una tarjeta
            </button>
          </div>
        ) : null}

        {puedeGestionar && nueva ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <Field label="Para qué es" required>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Material deportivo"
                  maxLength={60}
                  style={inputStyle}
                />
              </Field>
              <Field label="Límite (USD)">
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={limite}
                  onChange={(e) => setLimite(e.target.value)}
                  placeholder="Sin límite"
                  style={inputStyle}
                />
              </Field>
              <Field label="Cada">
                <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={inputStyle}>
                  <option value="monthly">Mes</option>
                  <option value="weekly">Semana</option>
                  <option value="daily">Día</option>
                  <option value="one_time">Una sola vez</option>
                </select>
              </Field>
              <Field label="Quién la lleva" required>
                <select value={titular} onChange={(e) => setTitular(e.target.value)} style={inputStyle}>
                  <option value="">Selecciona…</option>
                  {(data?.holders || []).map((h) => (
                    <option key={h.userId} value={h.userId}>
                      {h.name}
                      {h.pending ? ' (invitación sin aceptar)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {(data?.holders || []).length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--amber)', lineHeight: 1.5 }}>
                No se ha podido consultar quién puede llevar la tarjeta, así que no se puede emitir
                todavía. Vuelve a abrir la sección en un momento; si sigue igual, comprueba que la
                clave de la pasarela tenga el permiso «Ver quién puede llevar una tarjeta».
              </div>
            ) : null}
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              La tarjeta va a nombre de una persona del equipo, que es quien responde de lo que se
              gasta con ella. Si la persona todavía no ha terminado su alta en la pasarela, recibirá
              una invitación y la tarjeta no existirá hasta que la acepte.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                disabled={busy || !nombre.trim() || !titular}
                onClick={async () => {
                  const n = Number(limite)
                  const r = await onCreate({
                    name: nombre,
                    spendLimit: n > 0 ? n : null,
                    spendLimitFrequency: periodo,
                    assignedUserId: titular || null,
                    requestId: intento,
                  })
                  if (r === 'ok') {
                    cerrarFormulario()
                    setIntento(nuevoIntento())
                  } else if (r === 'rechazado') {
                    // Rechazo FIRME: no se creó nada. Se renueva la clave porque
                    // la pasarela repite también las respuestas de error durante
                    // 24 h, y sin renovarla el club se quedaría un día viendo el
                    // mismo fallo.
                    setIntento(nuevoIntento())
                  }
                  // Indeterminado: se CONSERVA la clave. La tarjeta puede haberse
                  // emitido igualmente, y renovarla convertiría el reintento en
                  // una petición nueva para la pasarela — que es exactamente como
                  // se acaba con dos tarjetas.
                }}
                style={primaryBtnStyle(busy || !nombre.trim() || !titular)}
              >
                {busy ? 'Emitiendo…' : 'Emitir tarjeta'}
              </button>
              <button type="button" onClick={cerrarFormulario} style={secondaryBtnStyle(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {cards.length > 0 ? (
        <div style={cardStyle}>
          <div
            style={{
              fontSize: 11.5,
              textTransform: 'uppercase',
              letterSpacing: '.05em',
              color: 'var(--text-muted)',
              fontWeight: 700,
            }}
          >
            En qué se ha gastado
          </div>
          {data?.hayMasMovimientos ? (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              Se muestran los movimientos más recientes; hay más histórico en la pasarela.
            </div>
          ) : null}
          {data?.movementsError ? (
            <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>{data.movementsError}</div>
          ) : (data?.movements || []).length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Todavía no se ha pagado nada con ellas.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(data?.movements || []).map((m) => {
                const devuelto = m.status === 'reversed' || (m.usdAmount != null && m.usdAmount < 0)
                const deQueTarjeta = cards.length > 1 ? nombreTarjeta(m.cardId) : null
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'baseline',
                      opacity: m.status === 'declined' ? 0.65 : 1,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.merchant}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {fecha(m.date)}
                        {deQueTarjeta ? ` · ${deQueTarjeta}` : ''}
                        {m.category ? ` · ${m.category}` : ''}
                        {m.status !== 'completed' ? ` · ${ESTADO_MOV[m.status]}` : ''}
                        {m.declinedReason ? ` · motivo: ${m.declinedReason.replace(/_/g, ' ')}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          color: devuelto ? 'var(--green, #16a34a)' : 'var(--text-primary)',
                        }}
                      >
                        {/* Con palabra, no solo con color: un daltónico veía una
                            devolución idéntica a un cargo. */}
                        {devuelto ? 'Devolución ' : ''}
                        {importeComercio(m)}
                      </div>
                      {m.localCurrency && m.localCurrency !== 'USD' ? (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {m.usdAmount == null ? 'aún sin liquidar' : `${usd(m.usdAmount)} de la tarjeta`}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : null}
    </Section>
  )
}

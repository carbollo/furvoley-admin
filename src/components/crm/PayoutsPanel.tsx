'use client'

/**
 * El dinero del club en la pasarela: saldos, cuenta bancaria y transferencias.
 *
 * Vivía dentro del modal de Ajustes del club, que no es donde nadie busca su
 * dinero. Se mueve a Contabilidad → Banco y aquí queda solo la pieza visual,
 * para que no haya dos copias de la misma pantalla.
 */

import { useEffect, useState } from 'react'
import { etiquetaOpcion } from '@/lib/whop/traducciones'
import { formatMoney } from '@/lib/format-money'

export type PayoutsState = {
  connected: boolean
  balances: { currency: string; available: number; pending: number; reserve: number }[]
  balancesError: string | null
  methods: {
    id: string
    nickname: string
    institution: string
    reference: string
    currency: string
    isDefault: boolean
    status: string
    verification: string | null
    unavailableReason: string | null
  }[]
  payouts: { id: string; amount: number; currency: string; net: number; status: string; createdAt: string }[]
  payoutsError: string | null
  pending: { amount: number; currency: string; createdAt: string }[]
  sweep: {
    frequency: string
    minAmount: number
    lastSweepAt: string | null
    hasPayoutMethod: boolean
    currency: string
  }
  permisos?: {
    /** El ADMIN puede quitarle al tesorero la capacidad de transferir. */
    treasurerCanTransfer: boolean
    cardDefaultLimit: number | null
    cardDefaultLimitPeriod: string
  }
}

export type SupportedMethod = {
  id: string
  name: string
  deliveryType: string
  requiredFields: {
    id: string
    label: string
    inputType: string
    placeholder: string
    options: string[]
    required: boolean
    sensitive: boolean
    validation: string | null
  }[]
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  fontFamily: 'inherit',
  fontSize: 13,
  color: 'var(--text-primary)',
  background: 'var(--surface-card)',
  outline: 'none',
  boxSizing: 'border-box',
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', letterSpacing: '-0.005em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{subtitle}</div>}
      </div>
      {children}
    </section>
  )
}

export function Field({ label, required, colSpan, children }: { label: string; required?: boolean; colSpan?: number; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: colSpan ? `span ${colSpan}` : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label} {required && <span style={{ color: 'var(--red)' }}>*</span>}
      </span>
      {children}
    </label>
  )
}

function ReadonlyValue({ value, mono, tone = 'default' }: { value: string; mono?: boolean; tone?: 'default' | 'warning' }) {
  return (
    <div
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
        fontSize: 13,
        fontWeight: tone === 'warning' ? 600 : 500,
        color: tone === 'warning' ? 'var(--amber)' : 'var(--text-primary)',
        background: 'var(--surface-low)',
        boxSizing: 'border-box',
        userSelect: 'all',
      }}
    >
      {value}
    </div>
  )
}

export function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 18px', borderRadius: 8, border: 'none',
    background: 'var(--accent)', color: '#fff',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.65 : 1,
    boxShadow: '0 1px 2px rgba(0,74,198,0.2)',
  }
}

export function secondaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 18px', borderRadius: 8,
    background: 'var(--surface-card)', color: 'var(--text-primary)',
    border: '1px solid var(--border-strong)',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.65 : 1,
  }
}

function countryCodeFrom(name: string): string {
  const n = String(name || '').trim().toLowerCase()
  if (!n) return ''
  if (/^[a-z]{2}$/.test(n)) return n.toUpperCase()
  const map: Record<string, string> = {
    españa: 'ES', espana: 'ES', spain: 'ES',
    portugal: 'PT', francia: 'FR', france: 'FR',
    italia: 'IT', italy: 'IT', alemania: 'DE', germany: 'DE',
    andorra: 'AD', méxico: 'MX', mexico: 'MX', argentina: 'AR',
    colombia: 'CO', chile: 'CL', perú: 'PE', peru: 'PE',
    'países bajos': 'NL', 'paises bajos': 'NL', holanda: 'NL', netherlands: 'NL',
    bélgica: 'BE', belgica: 'BE', belgium: 'BE',
    irlanda: 'IE', ireland: 'IE', 'reino unido': 'GB', 'united kingdom': 'GB',
    'estados unidos': 'US', 'united states': 'US', usa: 'US',
    suiza: 'CH', switzerland: 'CH', austria: 'AT', polonia: 'PL', poland: 'PL',
  }
  return map[n] || ''
}

function bankWarning(bank: PayoutsState['methods'][number]): string | null {
  if (bank.unavailableReason) {
    return 'Tu banco ya no admite este tipo de ingreso. Añade otra cuenta para seguir recibiendo el dinero.'
  }
  if (bank.status === 'broken') {
    return 'La última transferencia a esta cuenta falló. Revisa los datos o añade otra.'
  }
  if (bank.verification === 'warning' || bank.verification === 'broken') {
    return 'El banco no ha podido confirmar que la cuenta esté a nombre del club. Comprueba el titular.'
  }
  if (bank.verification === 'checking') {
    return 'El banco está comprobando la cuenta. La primera transferencia puede tardar algo más.'
  }
  return null
}

function fieldError(
  f: SupportedMethod['requiredFields'][number],
  value: string,
): string | null {
  const v = value.trim()
  if (!v) return null
  if (f.options.length > 0 && !f.options.includes(v)) return 'Elige una de las opciones.'
  if (f.validation) {
    try {
      if (!new RegExp(f.validation).test(v)) return 'El formato no es correcto.'
    } catch {
      /* si la expresión no es válida, lo comprueba el servidor */
    }
  }
  return null
}

function payoutStatusLabel(status: string): string {
  const map: Record<string, string> = {
    requested: 'Enviada',
    in_review: 'En revisión',
    processing: 'En camino',
    completed: 'Recibida',
    reversed: 'Devuelta',
    canceled: 'Cancelada',
    failed: 'Fallida',
    denied: 'Rechazada',
  }
  return map[status] || status
}

function money(n: number, currency: string): string {
  return formatMoney(n, currency)
}


export function PayoutsPanel({
  data,
  busy,
  bankMethods,
  bankMethodId,
  bankFields,
  countryHint,
  esAdmin,
  onLoad,
  onStartBank,
  onCancelBank,
  onChangeMethod,
  onFieldChange,
  onSaveBank,
  onTransferNow,
  onSweepChange,
}: {
  data: PayoutsState | null
  busy: boolean
  bankMethods: SupportedMethod[] | null
  bankMethodId: string
  bankFields: Record<string, string>
  countryHint: string
  /**
   * El servidor solo acepta a ADMIN en la cuenta bancaria y en la programacion
   * (payouts/methods y payouts/config). Sin esto, al tesorero se le ofrecian
   * botones que el servidor le rechazaba: tecleaba el IBAN entero del club para
   * que le contestara «Unauthorized».
   */
  esAdmin: boolean
  onLoad: () => void
  onStartBank: (country: string) => void
  onCancelBank: () => void
  onChangeMethod: (methodId: string) => void
  onFieldChange: (id: string, value: string) => void
  onSaveBank: () => void
  onTransferNow: (currency?: string) => void
  onSweepChange: (patch: {
    frequency?: string
    minAmount?: number
    treasurerCanTransfer?: boolean
  }) => void
}) {
  useEffect(() => {
    onLoad()
  }, [onLoad])

  // El importe minimo se pinta desde el estado y se resincroniza cuando llegan
  // datos nuevos: asi un rechazo del servidor no deja en pantalla un valor que
  // en realidad no se guardo.
  const [minimo, setMinimo] = useState(String(data?.sweep?.minAmount ?? 10))
  useEffect(() => {
    setMinimo(String(data?.sweep?.minAmount ?? 10))
  }, [data?.sweep?.minAmount])

  const cardStyle: React.CSSProperties = {
    padding: 20,
    borderRadius: 12,
    background: 'var(--surface-card)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  }

  // Un tesorero al que el ADMIN le haya quitado el permiso ve el saldo pero no
  // puede moverlo: el servidor tambien lo rechaza, esto solo evita el viaje.
  const puedeTransferir = esAdmin || data?.permisos?.treasurerCanTransfer !== false
  const bank = data?.methods?.find((m) => m.isDefault) || data?.methods?.[0] || null
  const method = bankMethods?.find((m) => m.id === bankMethodId) || bankMethods?.[0] || null

  // Nunca se suman divisas distintas: cada una es una fila con su propio saldo y
  // su propio botón. La del banco va primero, que es la que se transfiere sola.
  const bankCurrency = (data?.sweep?.currency || bank?.currency || 'EUR').toUpperCase()
  const rows = [...(data?.balances || [])]
    .filter((b) => b.available > 0 || b.pending > 0 || b.currency === bankCurrency)
    .sort((a, b) => (a.currency === bankCurrency ? -1 : b.currency === bankCurrency ? 1 : b.available - a.available))
  const main = rows.find((b) => b.currency === bankCurrency) || rows[0] || null

  // Sólo se puede guardar si están todos los obligatorios y ninguno da error.
  const bankFormReady =
    !!method?.requiredFields?.length &&
    method.requiredFields.every((f) => {
      const v = bankFields[f.id] || ''
      if (!v) return !f.required
      return !fieldError(f, v)
    })

  return (
    <>
      <Section title="Tu dinero" subtitle="Lo que has cobrado y cuándo llega a tu cuenta.">
        <div style={cardStyle}>
          {!data ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Consultando tu saldo…</div>
          ) : rows.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Todavía no has cobrado nada.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {rows.map((b) => {
                const isBank = b.currency === bankCurrency
                return (
                  <div
                    key={b.currency}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: 12,
                      alignItems: 'end',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                        Disponible{rows.length > 1 ? ` · ${b.currency}` : ''}
                      </div>
                      <div style={{ fontSize: isBank ? 26 : 20, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                        {money(b.available, b.currency)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                        En camino
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        {money(b.pending, b.currency)}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Cobros aún no liquidados</div>
                    </div>
                    {b.reserve > 0 ? (
                      <div>
                        <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                          Retenido
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                          {money(b.reserve, b.currency)}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Garantía de la pasarela</div>
                      </div>
                    ) : null}
                    {bank && puedeTransferir ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          disabled={busy || b.available <= 0}
                          onClick={() => onTransferNow(b.currency)}
                          style={
                            isBank
                              ? primaryBtnStyle(busy || b.available <= 0)
                              : secondaryBtnStyle(busy || b.available <= 0)
                          }
                        >
                          {busy ? 'Enviando…' : 'Transferir ahora'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          {main && rows.length > 1 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Las transferencias automáticas solo envían el saldo en {bankCurrency}, que es la divisa de tu
              cuenta. El resto puedes enviarlo tú cuando quieras; tu banco aplicará el cambio de moneda.
            </div>
          ) : null}

          {bank && !puedeTransferir ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              El administrador del club ha desactivado las transferencias manuales para el
              tesorero. El envío automático sigue funcionando con normalidad.
            </div>
          ) : null}
          {data?.pending?.length ? (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--amber-soft)', color: 'var(--amber)', fontSize: 12.5, fontWeight: 600 }}>
              ○ Hay {data.pending.length === 1 ? 'una transferencia' : `${data.pending.length} transferencias`} pendiente
              {data.pending.length === 1 ? '' : 's'} de confirmar ({data.pending.map((p) => money(p.amount, p.currency)).join(', ')}).
              No se enviará ninguna nueva hasta saber qué ha pasado con {data.pending.length === 1 ? 'ella' : 'ellas'}.
            </div>
          ) : null}

          {data?.balancesError ? (
            <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>{data.balancesError}</div>
          ) : null}
        </div>
      </Section>

      <Section
        title="Cuenta bancaria"
        subtitle="Donde te llega el dinero de las cuotas que cobras."
      >
        <div style={cardStyle}>
          {bank && !bankMethods ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <Field label="Banco">
                  <ReadonlyValue value={bank.institution || '—'} />
                </Field>
                <Field label="Cuenta">
                  <ReadonlyValue value={bank.reference || '—'} mono />
                </Field>
                <Field label="Divisa">
                  <ReadonlyValue value={bank.currency || 'EUR'} />
                </Field>
              </div>
              {bankWarning(bank) ? (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--amber-soft)', color: 'var(--amber)', fontSize: 12.5, fontWeight: 600 }}>
                  ○ {bankWarning(bank)}
                </div>
              ) : null}
              {esAdmin ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" disabled={busy} onClick={() => onStartBank(countryCodeFrom(countryHint))} style={secondaryBtnStyle(busy)}>
                    Cambiar cuenta
                  </button>
                </div>
              ) : null}
            </>
          ) : bankMethods ? (
            <>
              {bankMethods.length > 1 ? (
                <Field label="Forma de cobro">
                  <select
                    value={bankMethodId || method?.id || ''}
                    onChange={(e) => onChangeMethod(e.target.value)}
                    disabled={busy}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {bankMethods.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {method?.requiredFields?.length ? (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Introduce los datos de la cuenta donde quieres recibir el dinero.
                    {bank ? ' Sustituirá a la que tienes guardada a partir del próximo cobro.' : ''}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    {method.requiredFields.map((f) => {
                      const value = bankFields[f.id] || ''
                      const bad = fieldError(f, value)
                      return (
                        <Field key={f.id} label={f.label} required={f.required}>
                          {f.inputType === 'options' && f.options.length > 0 ? (
                            <select
                              value={value}
                              onChange={(e) => onFieldChange(f.id, e.target.value)}
                              style={{ ...inputStyle, cursor: 'pointer' }}
                            >
                              <option value="">Selecciona…</option>
                              {/* El valor viaja a la pasarela sin tocar; solo se
                                  traduce lo que se lee. */}
                              {f.options.map((o) => (
                                <option key={o} value={o}>{etiquetaOpcion(o)}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              // Los datos delicados (nº de cuenta) no se dejan a la
                              // vista de quien pase por detrás.
                              type={f.inputType === 'date' ? 'date' : f.sensitive ? 'password' : 'text'}
                              autoComplete="off"
                              spellCheck={false}
                              value={value}
                              onChange={(e) => onFieldChange(f.id, e.target.value)}
                              placeholder={f.placeholder}
                              style={bad ? { ...inputStyle, borderColor: 'var(--red)' } : inputStyle}
                            />
                          )}
                          {bad ? (
                            <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>{bad}</div>
                          ) : null}
                        </Field>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {busy ? 'Consultando qué datos hacen falta…' : 'No hay formas de cobro disponibles para tu país.'}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" disabled={busy} onClick={onCancelBank} style={secondaryBtnStyle(busy)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={busy || !bankFormReady}
                  onClick={onSaveBank}
                  style={primaryBtnStyle(busy || !bankFormReady)}
                >
                  {busy ? 'Guardando…' : 'Guardar cuenta'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--amber-soft)', color: 'var(--amber)', fontSize: 12.5, fontWeight: 600 }}>
                ○ Aún no has indicado dónde quieres recibir el dinero.
                {esAdmin ? '' : ' Tiene que hacerlo el administrador del club.'}
              </div>
              {esAdmin ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" disabled={busy} onClick={() => onStartBank(countryCodeFrom(countryHint))} style={primaryBtnStyle(busy)}>
                    {busy ? 'Cargando…' : 'Añadir cuenta bancaria'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </Section>

      {bank ? (
        <Section title="Transferencias automáticas" subtitle="Cada cuánto te enviamos lo cobrado.">
          <div style={cardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <Field label="Frecuencia">
                <select
                  value={data?.sweep?.frequency || 'WEEKLY'}
                  onChange={(e) => onSweepChange({ frequency: e.target.value })}
                  disabled={busy || !esAdmin}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="DAILY">Cada día</option>
                  <option value="WEEKLY">Cada semana</option>
                  <option value="MONTHLY">Cada mes</option>
                  <option value="OFF">Solo cuando yo lo pida</option>
                </select>
              </Field>
              <Field label={`Importe mínimo (${bankCurrency})`}>
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={minimo}
                  onChange={(e) => setMinimo(e.target.value)}
                  onBlur={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v) && v !== (data?.sweep?.minAmount ?? 10)) onSweepChange({ minAmount: v })
                  }}
                  disabled={busy || !esAdmin}
                  style={inputStyle}
                />
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                  {esAdmin
                    ? 'Por debajo de esto no se envía nada: la comisión se comería el importe.'
                    : 'Solo el administrador del club puede cambiar esto.'}
                </div>
              </Field>
            </div>
            {esAdmin ? (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  cursor: busy ? 'default' : 'pointer',
                  lineHeight: 1.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={data?.permisos?.treasurerCanTransfer !== false}
                  disabled={busy}
                  onChange={(e) => onSweepChange({ treasurerCanTransfer: e.target.checked })}
                  style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--accent)' }}
                />
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    El tesorero puede transferir el dinero al banco
                  </strong>
                  <br />
                  Si lo desmarcas, seguirá viendo el saldo y el historial, pero solo tú podrás
                  enviar el dinero a mano. El envío automático no se ve afectado.
                </span>
              </label>
            ) : null}
            {data?.sweep?.lastSweepAt ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Última transferencia: {new Date(data.sweep.lastSweepAt).toLocaleDateString('es-ES')}
              </div>
            ) : null}

            {data?.payoutsError ? (
              <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>{data.payoutsError}</div>
            ) : null}

            {data?.payouts?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                  Últimas transferencias
                </div>
                {data.payouts.slice(0, 5).map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 10 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString('es-ES') : '—'}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {money(p.net || p.amount, p.currency)}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{payoutStatusLabel(p.status)}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Importes ya con la comisión descontada: es lo que entra en tu cuenta.
                </div>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}
    </>
  )
}

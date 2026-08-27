'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDefaultRegistrationFields, type RegistrationFieldDef } from '@/lib/registration-fields'
import { RegistrationFieldsTab } from '@/components/crm/RegistrationFieldsTab'
import { formatMoney } from '@/lib/format-money'

type Settings = {
  id?: string
  name: string
  logoUrl: string | null
  legalName: string
  taxId: string
  address: string
  city: string
  postalCode: string
  province: string
  country: string
  contactEmail: string
  contactPhone: string
  website: string
  primaryColor: string
  invoicePdfTemplate: string
  registrationFieldsConfig: RegistrationFieldDef[]
  whop: WhopConfig
}

type WhopScope = { action: string; label: string; granted: boolean }



type WhopConfig = {
  hasCompany: boolean
  companyIdMasked: string
  onboardingStatus: 'NONE' | 'PENDING_KYC' | 'PENDING_BANK' | 'READY' | 'DISABLED'
  chargesEnabled: boolean
  payoutsEnabled: boolean
  hasPayoutMethod: boolean
  canCharge: boolean
  statusAt: string | null
  /** Alta en Whop con la atribución de partner del proveedor del CRM. */
  signupUrl: string
  /** Pestaña del dashboard de Whop donde se crean las API keys. */
  apiKeysUrl: string
}

const EMPTY_WHOP: WhopConfig = {
  hasCompany: false,
  companyIdMasked: '',
  onboardingStatus: 'NONE',
  chargesEnabled: false,
  payoutsEnabled: false,
  hasPayoutMethod: false,
  canCharge: false,
  statusAt: null,
  signupUrl: 'https://whop.com/network/sign-up/',
  apiKeysUrl: 'https://whop.com/dashboard/developer',
}

const EMPTY: Settings = {
  name: '',
  logoUrl: null,
  legalName: '',
  taxId: '',
  address: '',
  city: '',
  postalCode: '',
  province: '',
  country: 'España',
  contactEmail: '',
  contactPhone: '',
  website: '',
  primaryColor: '',
  invoicePdfTemplate: 'CLASSIC',
  registrationFieldsConfig: getDefaultRegistrationFields(),
  whop: EMPTY_WHOP,
}

type Tab = 'identity' | 'legal' | 'registration' | 'whop'

export function ClubSettingsModal({
  open,
  onClose,
  initialUser,
}: {
  open: boolean
  onClose: () => void
  initialUser?: { name?: string; email?: string; role?: string; initials?: string }
}) {
  const [tab, setTab] = useState<Tab>('identity')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  // Pasarela Whop: asistente de conexión (API key + permisos concedidos).
  const [whopBusy, setWhopBusy] = useState(false)
  const [whopScopes, setWhopScopes] = useState<WhopScope[] | null>(null)
  // Dinero del club: saldo, cuenta bancaria y transferencias.
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [form, setForm] = useState<Settings>(EMPTY)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/crm/club-settings', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setError(j.error || 'No se pudo cargar la configuración del club')
        return
      }
      const j = await r.json()
      const incoming = (j.settings || {}) as Partial<Settings>
      const s: Settings = {
        ...EMPTY,
        ...incoming,
        invoicePdfTemplate:
          typeof incoming.invoicePdfTemplate === 'string'
            ? incoming.invoicePdfTemplate
            : EMPTY.invoicePdfTemplate,
        registrationFieldsConfig: Array.isArray(incoming.registrationFieldsConfig)
          ? incoming.registrationFieldsConfig
          : getDefaultRegistrationFields(),
        whop: { ...EMPTY_WHOP, ...(incoming.whop || {}) },
      }
      setForm(s)
      setLogoPreview(s.logoUrl)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setTab('identity')
    setError(null)
    setInfo(null)
    load().catch(() => {})
  }, [open, load])

  // Cerrar con Escape
  const modalInteractionLocked = busy || whopBusy

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !modalInteractionLocked) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, modalInteractionLocked, onClose])

  if (!open) return null

  function update<K extends keyof Settings>(k: K, v: Settings[K]) {
    setForm((p) => ({ ...p, [k]: v }))
  }

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('El archivo seleccionado no es una imagen.')
      return
    }
    if (file.size > 1024 * 1024) {
      setError('La imagen es demasiado grande (máximo 1 MB).')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      setLogoPreview(url)
      setForm((p) => ({ ...p, logoUrl: url }))
      setError(null)
    }
    reader.onerror = () => setError('No se pudo leer la imagen seleccionada.')
    reader.readAsDataURL(file)
  }

  function removeLogo() {
    setLogoPreview(null)
    setForm((p) => ({ ...p, logoUrl: null }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      // No enviamos `whop`: es read-only.
      const { whop: _wh, ...editable } = form
      const r = await fetch('/api/crm/club-settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editable),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error || 'No se pudo guardar la configuración')
        return
      }
      const incoming = (j.settings || {}) as Partial<Settings>
      const s: Settings = {
        ...EMPTY,
        ...incoming,
        invoicePdfTemplate:
          typeof incoming.invoicePdfTemplate === 'string'
            ? incoming.invoicePdfTemplate
            : EMPTY.invoicePdfTemplate,
        registrationFieldsConfig: Array.isArray(incoming.registrationFieldsConfig)
          ? incoming.registrationFieldsConfig
          : getDefaultRegistrationFields(),
        whop: { ...EMPTY_WHOP, ...(incoming.whop || {}) },
      }
      setForm(s)
      setLogoPreview(s.logoUrl)
      setInfo('Cambios guardados correctamente.')
      window.dispatchEvent(new CustomEvent('club-settings-updated'))
      window.setTimeout(() => setInfo(null), 2400)
    } finally {
      setBusy(false)
    }
  }

  /** Guarda la API key que el club ha pegado y valida permisos contra Whop. */
  async function connectWhop(apiKey: string) {
    if (whopBusy) return
    setWhopBusy(true)
    setError(null)
    setInfo(null)
    try {
      const r = await fetch('/api/crm/whop-connect/connect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error || 'No se pudo conectar la cuenta de Whop')
        return
      }
      setWhopScopes(Array.isArray(j.scopes) ? j.scopes : null)
      await load()
      const missing = Array.isArray(j.missingScopes) ? j.missingScopes.length : 0
      setInfo(
        missing > 0
          ? `Cuenta conectada, pero faltan ${missing} permiso(s) en la key. Revisa la lista de abajo.`
          : 'Cuenta de Whop conectada correctamente.',
      )
      window.setTimeout(() => setInfo(null), 4000)
    } finally {
      setWhopBusy(false)
    }
  }

  /** Relee el estado de la pasarela y vuelve a comprobar los permisos de la key. */
  async function refreshWhopStatus() {
    if (whopBusy) return
    setWhopBusy(true)
    setError(null)
    setInfo(null)
    try {
      const r = await fetch('/api/crm/whop-connect/status', { method: 'POST', credentials: 'include' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error || 'No se pudo comprobar el estado de la pasarela')
        return
      }
      setWhopScopes(Array.isArray(j.scopes) ? j.scopes : null)
      if (j.keyValid === false) setError('La API key guardada ya no es válida. Vuelve a pegarla.')
      await load()
    } finally {
      setWhopBusy(false)
    }
  }

  async function disconnectWhop() {
    if (whopBusy) return
    const ok = window.confirm(
      '¿Desconectar la pasarela de cobro del CRM?\n\n' +
      'Tu cuenta, tu dinero y tu historial no se tocan: solo se deja de cobrar desde el CRM.'
    )
    if (!ok) return
    setWhopBusy(true)
    setError(null)
    setInfo(null)
    try {
      const r = await fetch('/api/crm/whop-connect/disconnect', { method: 'POST', credentials: 'include' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error || 'No se pudo desconectar la pasarela')
        return
      }
      setWhopScopes(null)
      await load()
      setInfo('Pasarela desconectada.')
      window.setTimeout(() => setInfo(null), 2400)
    } finally {
      setWhopBusy(false)
    }
  }

  const initials =
    initialUser?.initials ||
    (initialUser?.name || 'A')
      .split(' ')
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase()

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'identity', label: 'Identidad', icon: '★' },
    { id: 'legal', label: 'Información legal', icon: '§' },
    { id: 'registration', label: 'Campos de registro', icon: '◆' },
    { id: 'whop', label: 'Pasarela de cobro', icon: '◈' },
  ]

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (modalInteractionLocked) return
        onClose()
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(15,23,42,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, fontFamily: 'inherit',
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="club-settings-title"
        onSubmit={save}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 760, maxHeight: '92vh',
          background: 'var(--surface-card)',
          borderRadius: 14, border: '1px solid var(--border)',
          boxShadow: '0 25px 50px -12px rgba(15,23,42,0.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 32px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'flex-start', gap: 16,
          }}
        >
          <div
            style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'var(--accent-pill)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700, flexShrink: 0,
              border: '1px solid rgba(0,74,198,0.15)',
              overflow: 'hidden',
            }}
          >
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span>★</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Configuración del club
            </div>
            <h2
              id="club-settings-title"
              style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
            >
              {form.name || 'ProClubCRM'}
            </h2>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Sesión activa: <b style={{ color: 'var(--text-primary)' }}>{initialUser?.name || 'Administrador'}</b>
              {initialUser?.email ? <> · {initialUser.email}</> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={modalInteractionLocked}
            aria-label="Cerrar"
            style={{
              width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface-card)', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: modalInteractionLocked ? 'not-allowed' : 'pointer',
              fontSize: 18, lineHeight: 1, fontFamily: 'inherit',
              flexShrink: 0, transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-low)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-card)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >×</button>
        </div>

        {/* Tabs */}
        <div style={{ padding: '14px 32px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                letterSpacing: '0.02em',
                cursor: 'pointer',
                borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ marginRight: 6, opacity: 0.85 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '24px 32px', overflowY: 'auto', flex: 1, background: 'var(--surface)' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Cargando configuración…
            </div>
          ) : (
            <>
              {tab === 'identity' && (
                <IdentityTab
                  form={form}
                  update={update}
                  logoPreview={logoPreview}
                  fileRef={fileRef}
                  onPickLogo={onPickLogo}
                  removeLogo={removeLogo}
                />
              )}
              {tab === 'legal' && <LegalTab form={form} update={update} />}
              {tab === 'registration' && (
                <RegistrationFieldsTab
                  fields={form.registrationFieldsConfig}
                  onChange={(registrationFieldsConfig) =>
                    setForm((p) => ({ ...p, registrationFieldsConfig }))
                  }
                />
              )}
              {tab === 'whop' && (
                <>
                  <WhopTab
                    whop={form.whop}
                    scopes={whopScopes}
                    busy={whopBusy}
                    onConnect={connectWhop}
                    onRefresh={refreshWhopStatus}
                    onDisconnect={disconnectWhop}
                  />
                  {form.whop.hasCompany && (
                    <div
                      style={{
                        padding: '16px 20px',
                        borderRadius: 10,
                        background: 'var(--accent-2, var(--accent-pill))',
                        fontSize: 13.5,
                        lineHeight: 1.55,
                        color: 'var(--text-primary)',
                      }}
                    >
                      <strong>Tu dinero está en Contabilidad → Banco.</strong> Ahí ves lo cobrado,
                      indicas a qué cuenta bancaria quieres recibirlo y programas cada cuánto se te
                      transfiere. Aquí solo se conecta la pasarela.
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {(error || info) && (
            <div
              style={{
                marginTop: 20,
                padding: '12px 16px',
                borderRadius: 10,
                background: error ? 'var(--red-soft)' : 'var(--green-soft)',
                color: error ? 'var(--red)' : 'var(--green)',
                fontSize: 13, fontWeight: 600,
                border: '1px solid ' + (error ? 'rgba(186,26,26,0.2)' : 'rgba(5,150,105,0.2)'),
              }}
            >
              {error || info}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 32px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Los cambios se aplican solo al club activo.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={modalInteractionLocked}
              style={{
                padding: '10px 18px', borderRadius: 8,
                border: '1px solid var(--border-strong)', background: 'var(--surface-card)',
                color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                cursor: modalInteractionLocked ? 'not-allowed' : 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || loading}
              style={{
                padding: '10px 22px', borderRadius: 8, border: 'none',
                background: 'var(--accent)', color: '#fff',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                cursor: (busy || loading) ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 2px rgba(0,74,198,0.2)',
                opacity: (busy || loading) ? 0.75 : 1,
              }}
            >
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ─── TAB: Identidad ────────────────────────────────────────────────────────
function IdentityTab({
  form, update, logoPreview, fileRef, onPickLogo, removeLogo,
}: {
  form: Settings
  update: <K extends keyof Settings>(k: K, v: Settings[K]) => void
  logoPreview: string | null
  fileRef: React.RefObject<HTMLInputElement | null>
  onPickLogo: (e: React.ChangeEvent<HTMLInputElement>) => void
  removeLogo: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Section title="Marca" subtitle="Cómo se ve tu club en el panel y en el portal del socio.">
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 24, alignItems: 'flex-start' }}>
          {/* Escudo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 140, height: 140, borderRadius: 16,
                background: logoPreview ? '#fff' : 'var(--surface-low)',
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', position: 'relative',
              }}
            >
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>
                  SIN ESCUDO
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickLogo} style={{ display: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  padding: '7px 12px', borderRadius: 8,
                  border: '1px solid var(--border-strong)', background: 'var(--surface-card)',
                  color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >Subir escudo</button>
              {logoPreview && (
                <button
                  type="button"
                  onClick={removeLogo}
                  style={{
                    padding: '7px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--surface-card)',
                    color: 'var(--red)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >Quitar</button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 150 }}>
              PNG o JPG, máx. 1 MB. Recomendado: cuadrado.
            </div>
          </div>

          {/* Campos identidad */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nombre del club" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="ProClubCRM"
                style={inputStyle}
              />
            </Field>
            <Field label="Color corporativo (hex)">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  value={form.primaryColor}
                  onChange={(e) => update('primaryColor', e.target.value)}
                  placeholder="#004ac6"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <div
                  style={{
                    width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                    border: '1px solid var(--border)',
                    background: form.primaryColor || 'var(--surface-low)',
                  }}
                />
              </div>
            </Field>
            <Field label="Web pública del club">
              <input
                type="text"
                value={form.website}
                onChange={(e) => update('website', e.target.value)}
                placeholder="https://tuclub.com"
                style={inputStyle}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Contacto" subtitle="Datos que se mostrarán a los socios y en facturas.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Email de contacto">
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => update('contactEmail', e.target.value)}
              placeholder="info@tuclub.com"
              style={inputStyle}
            />
          </Field>
          <Field label="Teléfono">
            <input
              type="tel"
              value={form.contactPhone}
              onChange={(e) => update('contactPhone', e.target.value)}
              placeholder="+34 600 000 000"
              style={inputStyle}
            />
          </Field>
        </div>
      </Section>
    </div>
  )
}

// ─── TAB: Legal ────────────────────────────────────────────────────────────
function LegalTab({
  form, update,
}: {
  form: Settings
  update: <K extends keyof Settings>(k: K, v: Settings[K]) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Section title="Información fiscal" subtitle="Datos legales que aparecen en facturas y comunicaciones oficiales.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Razón social / Denominación legal">
            <input
              type="text"
              value={form.legalName}
              onChange={(e) => update('legalName', e.target.value)}
              placeholder="Club Deportivo S.L."
              style={inputStyle}
            />
          </Field>
          <Field label="CIF / NIF / VAT">
            <input
              type="text"
              value={form.taxId}
              onChange={(e) => update('taxId', e.target.value)}
              placeholder="B12345678"
              style={inputStyle}
            />
          </Field>
        </div>
      </Section>

      <Section title="Domicilio fiscal" subtitle="Dirección que se imprimirá en las facturas emitidas.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Dirección" colSpan={2}>
            <input
              type="text"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="Calle, número, piso"
              style={inputStyle}
            />
          </Field>
          <Field label="Código postal">
            <input
              type="text"
              value={form.postalCode}
              onChange={(e) => update('postalCode', e.target.value)}
              placeholder="28001"
              style={inputStyle}
            />
          </Field>
          <Field label="Ciudad">
            <input
              type="text"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              placeholder="Madrid"
              style={inputStyle}
            />
          </Field>
          <Field label="Provincia">
            <input
              type="text"
              value={form.province}
              onChange={(e) => update('province', e.target.value)}
              placeholder="Madrid"
              style={inputStyle}
            />
          </Field>
          <Field label="País">
            <input
              type="text"
              value={form.country}
              onChange={(e) => update('country', e.target.value)}
              placeholder="España"
              style={inputStyle}
            />
          </Field>
        </div>
      </Section>

      <Section title="Plantilla de factura PDF" subtitle="Las facturas incluyen razón social, NIF/CIF y domicilio fiscal anteriores. El diseño Moderno también usa el color corporativo definido en Identidad.">
        <Field label="Maquetación al descargar PDF">
          <select
            value={form.invoicePdfTemplate}
            onChange={(e) => update('invoicePdfTemplate', e.target.value)}
            style={{
              ...inputStyle,
              cursor: 'pointer',
            }}
          >
            <option value="CLASSIC">Clásico (detalle y bloque fiscal claro)</option>
            <option value="MODERN">Moderno (cabecera a color corporativo)</option>
            <option value="COMPACT">Compacto (más contenido por página)</option>
          </select>
        </Field>
      </Section>
    </div>
  )
}

/** Numerito del paso del asistente (verde cuando el paso está hecho). */
function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      style={{
        width: 26,
        height: 26,
        flexShrink: 0,
        borderRadius: 999,
        display: 'grid',
        placeItems: 'center',
        fontSize: 12.5,
        fontWeight: 800,
        background: done ? 'var(--green-soft)' : 'var(--surface-low)',
        color: done ? 'var(--green)' : 'var(--text-secondary)',
        border: `1px solid ${done ? 'var(--green)' : 'var(--border)'}`,
      }}
    >
      {done ? '✓' : n}
    </span>
  )
}

/**
 * Pasarela de cobro del club (Whop). Asistente de 3 pasos:
 *   1. Crear la cuenta (enlace con la atribución de partner del proveedor).
 *   2. Crear la API key en el panel de la pasarela (guía + enlace directo).
 *   3. Pegarla aquí: el CRM valida la key, resuelve la cuenta y comprueba permisos.
 *
 * Se evita nombrar la pasarela más de lo imprescindible: para el club esto es
 * «la pasarela de cobro del CRM».
 */
function WhopTab({
  whop,
  scopes,
  busy,
  onConnect,
  onRefresh,
  onDisconnect,
}: {
  whop: WhopConfig
  scopes: WhopScope[] | null
  busy: boolean
  onConnect: (apiKey: string) => void
  onRefresh: () => void
  onDisconnect: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const connected = whop.hasCompany
  const missing = (scopes || []).filter((s) => !s.granted)

  const cardStyle: React.CSSProperties = {
    padding: 20,
    borderRadius: 12,
    background: 'var(--surface-card)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  }
  const stepRow: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start' }
  const helpText: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Section
        title="Cobra las cuotas de tus socios"
        subtitle="Conecta una pasarela de pago para cobrar online. El dinero va directo a tu cuenta bancaria."
      >
        <div style={cardStyle}>
          {/* Banda de estado */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: whop.canCharge
                ? 'var(--green-soft)'
                : connected
                  ? 'var(--amber-soft)'
                  : 'var(--surface-low)',
              color: whop.canCharge
                ? 'var(--green)'
                : connected
                  ? 'var(--amber)'
                  : 'var(--text-secondary)',
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            {whop.canCharge
              ? '✓ Pasarela activa: ya puedes cobrar las cuotas online.'
              : connected
                ? '○ Cuenta conectada. Falta terminar la verificación y añadir tu cuenta bancaria.'
                : '○ Sin pasarela conectada: los cobros online están desactivados.'}
          </div>

          {connected ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <StatusPill ok={connected} label="Cuenta conectada" />
                <StatusPill ok={whop.chargesEnabled} label="Cobros activos" />
                <StatusPill ok={whop.hasPayoutMethod} label="Banco añadido" />
              </div>
              <Field label="Identificador de tu cuenta">
                <ReadonlyValue value={whop.companyIdMasked || '—'} mono />
              </Field>
            </>
          ) : null}

          {/* Paso 1 — crear la cuenta (con la atribución de partner) */}
          <div style={stepRow}>
            <StepBadge n={1} done={connected} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                Crea tu cuenta de cobros
              </div>
              <p style={helpText}>
                Se abre el registro en una pestaña nueva. Usa el email del club y completa el alta.
                Al terminar, tu cuenta queda vinculada a ProClubCRM.
              </p>
              <div>
                <a
                  href={whop.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...primaryBtnStyle(false), display: 'inline-block', textDecoration: 'none' }}
                >
                  Crear mi cuenta de cobros ↗
                </a>
              </div>
            </div>
          </div>

          {/* Paso 2 — crear la API key */}
          <div style={stepRow}>
            <StepBadge n={2} done={connected} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                Genera tu clave de conexión
              </div>
              <p style={helpText}>
                Es la clave que permite al CRM emitir tus cobros. En la página que se abre:
              </p>
              <ol style={{ ...helpText, paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <li>Busca la sección <strong>Account API Keys</strong> y pulsa <strong>Create</strong>.</li>
                <li>Ponle un nombre, por ejemplo <em>ProClubCRM</em>.</li>
                <li>Elige el rol <strong>Admin</strong> (así tendrá todos los permisos necesarios).</li>
                <li>Copia la clave que aparece: <strong>solo se muestra una vez</strong>. Empieza por <code>whop_</code>.</li>
              </ol>
              <div>
                <a
                  href={whop.apiKeysUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...secondaryBtnStyle(false), display: 'inline-block', textDecoration: 'none' }}
                >
                  Abrir la página de claves ↗
                </a>
              </div>
            </div>
          </div>

          {/* Paso 3 — pegar la clave */}
          <div style={stepRow}>
            <StepBadge n={3} done={connected} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                {connected ? 'Sustituir la clave' : 'Pega aquí tu clave'}
              </div>
              <p style={helpText}>
                Se guarda cifrada y no vuelve a mostrarse. Si la pierdes, genera una nueva y pégala
                aquí otra vez. Al desconectar, el CRM la borra: recuerda revocarla también en tu
                panel de la pasarela.
              </p>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="whop_…"
                autoComplete="off"
                spellCheck={false}
                style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
                {connected && (
                  <button type="button" onClick={onDisconnect} disabled={busy} style={dangerBtnStyle(busy)}>
                    Desconectar
                  </button>
                )}
                {connected && (
                  <button type="button" onClick={onRefresh} disabled={busy} style={secondaryBtnStyle(busy)}>
                    {busy ? 'Comprobando…' : 'Comprobar estado'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onConnect(apiKey.trim())
                    setApiKey('')
                  }}
                  disabled={busy || apiKey.trim().length < 8}
                  style={primaryBtnStyle(busy || apiKey.trim().length < 8)}
                >
                  {busy ? 'Conectando…' : connected ? 'Guardar clave nueva' : 'Conectar pasarela'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Permisos concedidos por la clave */}
      {scopes && scopes.length > 0 && (
        <Section
          title="Permisos de la clave"
          subtitle={
            missing.length > 0
              ? 'Faltan permisos: crea una clave nueva con el rol «Admin» y pégala arriba.'
              : 'Tu clave tiene todo lo que el CRM necesita.'
          }
        >
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {scopes.map((s) => (
                <div
                  key={s.action}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}
                >
                  <span style={{ color: s.granted ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>
                    {s.granted ? '✓' : '✕'}
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}

/**
 * Código de país ISO a partir del país escrito en los datos del club.
 *
 * Devuelve '' si no se reconoce, y entonces no se manda el país: la pasarela lo
 * deduce de la propia cuenta. Suponer «España» le pintaría a un club de fuera un
 * formulario de cuenta española, que es justo donde no debe ir su dinero.
 */
/**
 * El dinero del club: cuánto ha cobrado, a qué cuenta se le manda y cuándo.
 *
 * El club no ve un "saldo que retirar": ve lo que tiene pendiente de recibir y
 * la transferencia que le va a entrar en el banco.
 */
function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      style={{
        padding: '8px 12px', borderRadius: 8,
        background: ok ? 'var(--green-soft)' : 'var(--amber-soft)',
        color: ok ? 'var(--green)' : 'var(--amber)',
        fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 8,
        lineHeight: 1.2,
      }}
    >
      <span aria-hidden style={{ fontSize: 13 }}>{ok ? '✓' : '○'}</span>
      <span>{label}</span>
    </div>
  )
}

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 18px', borderRadius: 8, border: 'none',
    background: 'var(--accent)', color: '#fff',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.65 : 1,
    boxShadow: '0 1px 2px rgba(0,74,198,0.2)',
  }
}
function secondaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 18px', borderRadius: 8,
    background: 'var(--surface-card)', color: 'var(--text-primary)',
    border: '1px solid var(--border-strong)',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.65 : 1,
  }
}
function dangerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 18px', borderRadius: 8,
    background: 'transparent', color: 'var(--red)',
    border: '1px solid rgba(186,26,26,0.35)',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.65 : 1,
  }
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

// ─── Helpers UI ────────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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

function Field({ label, required, colSpan, children }: { label: string; required?: boolean; colSpan?: number; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: colSpan ? `span ${colSpan}` : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label} {required && <span style={{ color: 'var(--red)' }}>*</span>}
      </span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
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

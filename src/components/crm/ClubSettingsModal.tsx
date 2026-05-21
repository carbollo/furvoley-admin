'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDefaultRegistrationFields, type RegistrationFieldDef } from '@/lib/registration-fields'
import { RegistrationFieldsTab } from '@/components/crm/RegistrationFieldsTab'

type StripeConfig = {
  source: 'env'
  hasCustomerId: boolean
  customerIdMasked: string
  dashboardUrl: string
}

type ConnectConfig = {
  source: 'env' | 'db' | 'none'
  hasConnectedAccount: boolean
  connectedAccountIdMasked: string
  applicationFeePercent: number
  accountType: 'express' | 'standard' | 'custom' | 'unknown'
  chargesEnabled: boolean | null
  payoutsEnabled: boolean | null
  detailsSubmitted: boolean | null
  statusAt: string | null
}

type WebhooksStatus = {
  ok: boolean
  configured: boolean
  publicUrl: string | null
  webhookUrl: string | null
  platformWebhookId: string | null
  connectWebhookId: string | null
  hasPlatformSecret: boolean
  hasConnectSecret: boolean
  envOverridesPlatform: boolean
  envOverridesConnect: boolean
  lastSyncedAt: string | null
  error: string | null
}

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
  stripe: StripeConfig
  connect: ConnectConfig
  webhooks: WebhooksStatus
}

const EMPTY_STRIPE: StripeConfig = {
  source: 'env',
  hasCustomerId: false,
  customerIdMasked: '',
  dashboardUrl: 'https://dashboard.stripe.com/',
}

const EMPTY_CONNECT: ConnectConfig = {
  source: 'none',
  hasConnectedAccount: false,
  connectedAccountIdMasked: '',
  applicationFeePercent: 0,
  accountType: 'unknown',
  chargesEnabled: null,
  payoutsEnabled: null,
  detailsSubmitted: null,
  statusAt: null,
}

const EMPTY_WEBHOOKS: WebhooksStatus = {
  ok: false,
  configured: false,
  publicUrl: null,
  webhookUrl: null,
  platformWebhookId: null,
  connectWebhookId: null,
  hasPlatformSecret: false,
  hasConnectSecret: false,
  envOverridesPlatform: false,
  envOverridesConnect: false,
  lastSyncedAt: null,
  error: null,
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
  stripe: EMPTY_STRIPE,
  connect: EMPTY_CONNECT,
  webhooks: EMPTY_WEBHOOKS,
}

type Tab = 'identity' | 'legal' | 'registration' | 'subscription'

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
  const [openingStripeWindow, setOpeningStripeWindow] = useState(false)
  const [connectBusy, setConnectBusy] = useState(false)
  const [webhookBusy, setWebhookBusy] = useState(false)
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
        stripe: { ...EMPTY_STRIPE, ...(incoming.stripe || {}) },
        connect: { ...EMPTY_CONNECT, ...(incoming.connect || {}) },
        webhooks: { ...EMPTY_WEBHOOKS, ...(incoming.webhooks || {}) },
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
  const modalInteractionLocked = busy || openingStripeWindow || connectBusy || webhookBusy

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
      // No enviamos `stripe`, `connect` ni `webhooks`: son read-only.
      const { stripe: _s, connect: _c, webhooks: _w, ...editable } = form
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
        stripe: { ...EMPTY_STRIPE, ...(incoming.stripe || {}) },
        connect: { ...EMPTY_CONNECT, ...(incoming.connect || {}) },
        webhooks: { ...EMPTY_WEBHOOKS, ...(incoming.webhooks || {}) },
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

  async function openConnectLogin() {
    if (openingStripeWindow) return
    setOpeningStripeWindow(true)
    setError(null)
    setInfo(null)
    try {
      const r = await fetch('/api/crm/club-settings/connect-login', {
        method: 'POST',
        credentials: 'include',
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.url) {
        setError(j.error || 'No se pudo abrir el dashboard del cliente conectado')
        return
      }
      if (j.note) setInfo(String(j.note))
      window.open(j.url, '_blank', 'noopener,noreferrer')
    } finally {
      setOpeningStripeWindow(false)
    }
  }

  async function startConnectOnboarding() {
    if (connectBusy) return
    setConnectBusy(true)
    setError(null)
    setInfo(null)
    try {
      const r = await fetch('/api/crm/stripe-connect/start', {
        method: 'POST',
        credentials: 'include',
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.url) {
        const stripeDetail = typeof j.detail === 'string' && j.detail.trim() ? `\n(${j.detail.trim()})` : ''
        setError((j.error || 'No se pudo iniciar el onboarding de Stripe Connect') + stripeDetail)
        return
      }
      window.location.href = String(j.url)
    } finally {
      setConnectBusy(false)
    }
  }
  async function refreshConnectStatus() {
    if (connectBusy) return
    setConnectBusy(true)
    setError(null)
    setInfo(null)
    try {
      const r = await fetch('/api/crm/stripe-connect/status', {
        method: 'POST',
        credentials: 'include',
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error || 'No se pudo refrescar el estado de la cuenta conectada')
        return
      }
      await load()
      setInfo('Estado de la cuenta conectada actualizado.')
      window.setTimeout(() => setInfo(null), 2400)
    } finally {
      setConnectBusy(false)
    }
  }
  async function disconnectAccount() {
    if (connectBusy) return
    const ok = window.confirm(
      '¿Desvincular la cuenta de Stripe del CRM?\n\n' +
      'La cuenta no se elimina en Stripe, solo deja de usarse para los cobros del club.'
    )
    if (!ok) return
    setConnectBusy(true)
    setError(null)
    setInfo(null)
    try {
      const r = await fetch('/api/crm/stripe-connect/disconnect', {
        method: 'POST',
        credentials: 'include',
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(j.error || 'No se pudo desvincular la cuenta')
        return
      }
      await load()
      setInfo('Cuenta desvinculada del CRM.')
      window.setTimeout(() => setInfo(null), 2400)
    } finally {
      setConnectBusy(false)
    }
  }

  async function resyncWebhooks() {
    if (webhookBusy) return
    setWebhookBusy(true)
    setError(null)
    setInfo(null)
    try {
      const r = await fetch('/api/crm/club-settings/bootstrap-stripe', {
        method: 'POST',
        credentials: 'include',
      })
      const j = await r.json().catch(() => ({}))
      const next = (j.status || null) as WebhooksStatus | null
      if (next) {
        setForm((prev) => ({ ...prev, webhooks: { ...EMPTY_WEBHOOKS, ...next } }))
      }
      if (!r.ok) {
        setError(j.error || 'No se pudo sincronizar los webhooks con Stripe')
      } else {
        setInfo('Webhooks de Stripe sincronizados correctamente.')
        window.setTimeout(() => setInfo(null), 2400)
      }
    } finally {
      setWebhookBusy(false)
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
    { id: 'subscription', label: 'Pagos', icon: '◇' },
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
              {form.name || 'Furvoley'}
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
              {tab === 'subscription' && (
                <SubscriptionTab
                  connect={form.connect}
                  webhooks={form.webhooks}
                  onOpenConnect={openConnectLogin}
                  onResyncWebhooks={resyncWebhooks}
                  onStartOnboarding={startConnectOnboarding}
                  onRefreshConnect={refreshConnectStatus}
                  onDisconnectAccount={disconnectAccount}
                  connectDashboardBusy={openingStripeWindow}
                  webhookBusy={webhookBusy}
                  connectBusy={connectBusy}
                />
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
                placeholder="Furvoley"
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
                placeholder="https://furvoley.es"
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
              placeholder="info@furvoley.es"
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
              placeholder="Club Furvoley S.L."
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

// ─── TAB: Pagos Stripe (Connect + notificaciones) ───────────────────────────
function SubscriptionTab({
  connect,
  webhooks,
  onOpenConnect,
  onResyncWebhooks,
  onStartOnboarding,
  onRefreshConnect,
  onDisconnectAccount,
  connectDashboardBusy,
  webhookBusy,
  connectBusy,
}: {
  connect: ConnectConfig
  webhooks: WebhooksStatus
  onOpenConnect: () => void
  onResyncWebhooks: () => void
  onStartOnboarding: () => void
  onRefreshConnect: () => void
  onDisconnectAccount: () => void
  connectDashboardBusy: boolean
  webhookBusy: boolean
  connectBusy: boolean
}) {
  const onboardingComplete = !!(connect.detailsSubmitted && connect.chargesEnabled)
  const onboardingPending = connect.hasConnectedAccount && !onboardingComplete
  const isEnvOverride = connect.source === 'env'
  const webhookStatusOk = webhooks.configured && !webhooks.error
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      <Section title="Cobros con Stripe (club)" subtitle="Enlaza la cuenta donde se ingresan los pagos de los socios.">
        <div
          style={{
            padding: 20, borderRadius: 12,
            background: 'var(--surface-card)',
            border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}
        >
          {/* Nota corta solo si hace falta (sin variables ni hosting) */}
          {isEnvOverride ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              La cuenta de Stripe de este club está fijada en la configuración del servidor (no puede cambiarse desde aquí).
            </div>
          ) : null}

          {!isEnvOverride && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label={connect.hasConnectedAccount ? 'Referencia cuenta' : 'Estado cuenta'}>
                  <ReadonlyValue
                    value={connect.hasConnectedAccount ? connect.connectedAccountIdMasked : 'Sin enlace'}
                    mono
                    tone={connect.hasConnectedAccount ? 'default' : 'warning'}
                  />
                </Field>
                <Field label="Comisión plataforma">
                  <ReadonlyValue
                    value={connect.applicationFeePercent > 0
                      ? connect.applicationFeePercent + ' %'
                      : 'Ninguna'}
                  />
                </Field>
              </div>

              {connect.hasConnectedAccount && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <StatusPill ok={!!connect.detailsSubmitted} label="Datos completos" />
                  <StatusPill ok={!!connect.chargesEnabled} label="Cobros habilitados" />
                  <StatusPill ok={!!connect.payoutsEnabled} label="Liquidaciones habilitadas" />
                </div>
              )}

              <div
                style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: onboardingComplete
                    ? 'var(--green-soft)'
                    : connect.hasConnectedAccount
                      ? 'var(--amber-soft)'
                      : 'var(--surface-low)',
                  color: onboardingComplete
                    ? 'var(--green)'
                    : connect.hasConnectedAccount
                      ? 'var(--amber)'
                      : 'var(--text-secondary)',
                  fontSize: 12.5, fontWeight: 600, lineHeight: 1.5,
                }}
              >
                {onboardingComplete
                  ? 'La cuenta está lista para recibir pagos desde el club.'
                  : onboardingPending
                    ? 'Abre Stripe y termina los pasos que falten antes de poder cobrar.'
                    : 'Sin cuenta enlazada. Conecta Stripe del club para dirigir ahí los pagos de socios.'}
              </div>
            </>
          )}

          {isEnvOverride && connect.hasConnectedAccount && (
            <div
              style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'var(--surface-low)',
                color: 'var(--text-secondary)',
                fontSize: 12.5, fontWeight: 600,
                lineHeight: 1.5,
              }}
            >
              Cuenta activa ({connect.connectedAccountIdMasked}). Los cobros se dirigen ahí según tu configuración.
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
            {!isEnvOverride && !connect.hasConnectedAccount && (
              <button
                type="button"
                onClick={onStartOnboarding}
                disabled={connectBusy}
                style={primaryBtnStyle(connectBusy)}
              >
                {connectBusy ? 'Abriendo…' : 'Conectar mi cuenta de Stripe'}
              </button>
            )}
            {!isEnvOverride && onboardingPending && (
              <button
                type="button"
                onClick={onStartOnboarding}
                disabled={connectBusy}
                style={primaryBtnStyle(connectBusy)}
              >
                {connectBusy ? 'Abriendo…' : 'Continuar en Stripe'}
              </button>
            )}
            {connect.hasConnectedAccount && !isEnvOverride && (
              <button
                type="button"
                onClick={onRefreshConnect}
                disabled={connectBusy}
                style={secondaryBtnStyle(connectBusy)}
              >
                {connectBusy ? 'Actualizando…' : 'Actualizar estado'}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenConnect}
              disabled={connectDashboardBusy || !connect.hasConnectedAccount}
              style={primaryBtnStyle(connectDashboardBusy || !connect.hasConnectedAccount)}
            >
              {connectDashboardBusy ? 'Abriendo…' : 'Ver cuenta del club en Stripe'}
            </button>
            {connect.hasConnectedAccount && !isEnvOverride && (
              <button
                type="button"
                onClick={onDisconnectAccount}
                disabled={connectBusy}
                style={dangerBtnStyle(connectBusy)}
              >
                Desvincular cuenta
              </button>
            )}
          </div>
        </div>
      </Section>

      <Section title="Notificaciones de pago" subtitle="Stripe avisa cuando un socio ha pagado. Si cambia la dirección del sitio, puede hacer falta refrescar desde aquí.">
        <div
          style={{
            padding: 20, borderRadius: 12,
            background: 'var(--surface-card)',
            border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}
        >
          <div
            style={{
              padding: '12px 14px', borderRadius: 8,
              background: webhookStatusOk ? 'var(--green-soft)' : webhooks.error ? 'var(--red-soft)' : 'var(--amber-soft)',
              color: webhookStatusOk ? 'var(--green)' : webhooks.error ? 'var(--red)' : 'var(--amber)',
              fontSize: 13, fontWeight: 600,
              lineHeight: 1.5,
            }}
          >
            {webhooks.error
              ? 'No se ha podido comprobar o actualizar las notificaciones automáticas de pago. Prueba más tarde o pulsa Actualizar enlaces.'
              : webhookStatusOk
                ? 'Todo correcto. Los avisos de pago se registran solos al pagar (configuración guardada en el sistema).'
                : webhooks.webhookUrl
                  ? 'Pulsa Actualizar enlaces para registrar los avisos de pago en Stripe (no hace falta configurar Railway).'
                  : 'No se puede usar esta acción porque falta la dirección web pública del sitio. Consulta con el equipo técnico.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onResyncWebhooks}
              disabled={webhookBusy || !webhooks.webhookUrl}
              style={{
                padding: '10px 18px', borderRadius: 8, border: 'none',
                background: 'var(--accent)', color: '#fff',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                cursor: (webhookBusy || !webhooks.webhookUrl) ? 'not-allowed' : 'pointer',
                opacity: (webhookBusy || !webhooks.webhookUrl) ? 0.65 : 1,
                boxShadow: '0 1px 2px rgba(0,74,198,0.2)',
              }}
            >
              {webhookBusy ? 'Actualizando…' : 'Actualizar enlaces'}
            </button>
          </div>
        </div>
      </Section>
    </div>
  )
}

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

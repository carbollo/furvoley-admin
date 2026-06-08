'use client'

import { useCallback, useEffect, useState } from 'react'

type Tenant = { id: string; name: string; url: string; internalUrl?: string }

export function PortalLoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pickTenants, setPickTenants] = useState<Tenant[]>([])
  const [pending, setPending] = useState<{ email: string; password: string } | null>(null)

  async function login(body: { email: string; password: string; tenantId?: string }) {
    setError('')
    setBusy(true)
    try {
      const url = body.tenantId ? '/api/portal-central/login/tenant' : '/api/portal-central/login'
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json().catch(() => ({}))
      if (r.status === 409 && Array.isArray(data.tenants)) {
        setPending({ email: body.email, password: body.password })
        setPickTenants(data.tenants)
        setError('Esta cuenta existe en varios clubs. Elige uno:')
        return
      }
      if (!r.ok) {
        setError(data.error || 'No se pudo iniciar sesión.')
        return
      }
      if (data.redirectUrl) window.location.assign(data.redirectUrl)
    } catch {
      setError('Error de red.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error ? (
        <div
          style={{
            background: '#fff1f2',
            color: '#be123c',
            border: '1px solid #fecdd3',
            borderRadius: 10,
            padding: '12px 14px',
            fontSize: 14,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      ) : null}
      {pickTenants.length === 0 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setPickTenants([])
            void login({ email: email.trim(), password })
          }}
        >
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Correo electrónico
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
          <button type="submit" disabled={busy} style={buttonStyle}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {pickTenants.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy || !pending}
              onClick={() => pending && void login({ ...pending, tenantId: t.id })}
              style={{
                ...buttonStyle,
                background: '#fff',
                color: '#0f172a',
                border: '1px solid #e2e8f0',
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '12px 14px',
  marginBottom: 14,
  font: 'inherit',
}

const buttonStyle: React.CSSProperties = {
  width: '100%',
  border: 0,
  borderRadius: 10,
  padding: '12px 14px',
  background: '#2563eb',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  font: 'inherit',
}

export function PortalAdminPanel() {
  const [authed, setAuthed] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [url, setUrl] = useState('')
  const [internalUrl, setInternalUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const loadTenants = useCallback(async () => {
    const r = await fetch('/api/portal-central/admin/tenants', { credentials: 'include' })
    if (!r.ok) return false
    const data = await r.json()
    setTenants(Array.isArray(data.tenants) ? data.tenants : [])
    return true
  }, [])

  useEffect(() => {
    fetch('/api/portal-central/admin/login', { credentials: 'include' })
      .then((r) => r.json())
      .then(async (j) => {
        if (j.authenticated) {
          setAuthed(true)
          await loadTenants()
        }
      })
      .catch(() => undefined)
  }, [loadTenants])

  async function adminLogin() {
    setError('')
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Error')
      setAuthed(true)
      setAdminPassword('')
      await loadTenants()
      setOkMsg('Sesión admin iniciada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function saveTenant() {
    setError('')
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/tenants', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          id: id.trim(),
          url: url.trim(),
          internalUrl: internalUrl.trim(),
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Error')
      setTenants(data.tenants || [])
      setName('')
      setId('')
      setUrl('')
      setInternalUrl('')
      setOkMsg('CRM guardado.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function removeTenant(tenantId: string) {
    if (!confirm('¿Eliminar este CRM?')) return
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/tenants/' + encodeURIComponent(tenantId), {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Error')
      setTenants(data.tenants || [])
      setOkMsg('CRM eliminado.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function testTenant(tenantId: string) {
    setError('')
    setOkMsg('')
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/tenants/' + encodeURIComponent(tenantId), {
        method: 'PUT',
        credentials: 'include',
      })
      const data = await r.json().catch(() => ({}))
      if (data.ok) {
        setOkMsg(data.message || 'CRM accesible.')
      } else {
        setError(data.message || 'Fallo la prueba')
      }
    } catch {
      setError('Error de red')
    } finally {
      setBusy(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 14,
    padding: 24,
    marginBottom: 16,
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24, color: '#f8fafc' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>Panel admin del portal</h1>
      <p style={{ margin: '0 0 20px', color: '#94a3b8', lineHeight: 1.5, fontSize: 14 }}>
        Añade las URLs de cada CRM. Los usuarios entran por <strong>/portal</strong>.
      </p>

      {error ? <Msg kind="error" text={error} onClose={() => setError('')} /> : null}
      {okMsg ? <Msg kind="ok" text={okMsg} onClose={() => setOkMsg('')} /> : null}

      {!authed ? (
        <div style={cardStyle}>
          <label style={labelStyle}>Contraseña admin</label>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            style={darkInput}
          />
          <button type="button" disabled={busy} onClick={() => void adminLogin()} style={buttonStyle}>
            Entrar al panel
          </button>
        </div>
      ) : (
        <>
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Añadir CRM</h2>
            <label style={labelStyle}>Nombre del club</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Furvoley" style={darkInput} />
            <label style={labelStyle}>Identificador (opcional)</label>
            <input value={id} onChange={(e) => setId(e.target.value)} placeholder="furvoley" style={darkInput} />
            <label style={labelStyle}>URL pública del CRM</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://furvoley.up.railway.app"
              style={darkInput}
            />
            <label style={labelStyle}>URL interna Railway (opcional)</label>
            <input
              value={internalUrl}
              onChange={(e) => setInternalUrl(e.target.value)}
              placeholder="http://furvoley.railway.internal:8080"
              style={darkInput}
            />
            <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>
              Copia el hostname de <strong>Private Networking del servicio CRM</strong> (no del portal).
              Sin puerto se usa :8080. La URL pública no lleva <code>/login</code>.
            </p>
            <button type="button" disabled={busy} onClick={() => void saveTenant()} style={buttonStyle}>
              Guardar CRM
            </button>
          </div>
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>CRMs configurados</h2>
            {tenants.length === 0 ? (
              <p style={{ color: '#94a3b8', margin: 0 }}>Aún no hay CRMs.</p>
            ) : (
              tenants.map((t) => (
                <div
                  key={t.id}
                  style={{
                    border: '1px solid #334155',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <strong>{t.name}</strong>
                  <div style={{ color: '#94a3b8', fontSize: 13, wordBreak: 'break-all' }}>
                    {t.id} · {t.url}
                    {t.internalUrl ? (
                      <>
                        <br />
                        interna: {t.internalUrl}
                      </>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void testTenant(t.id)}
                      style={{ ...buttonStyle, width: 'auto', background: '#334155' }}
                    >
                      Probar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeTenant(t.id)}
                      style={{ ...buttonStyle, width: 'auto', background: 'transparent', border: '1px solid #fb7185', color: '#fb7185' }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Msg({ kind, text, onClose }: { kind: 'error' | 'ok'; text: string; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 4000)
    return () => window.clearTimeout(t)
  }, [onClose, text])
  return (
    <div
      style={{
        marginBottom: 14,
        padding: '12px 14px',
        borderRadius: 10,
        fontSize: 14,
        background: kind === 'error' ? 'rgba(251,113,133,.12)' : 'rgba(74,222,128,.12)',
        color: kind === 'error' ? '#fb7185' : '#4ade80',
      }}
    >
      {text}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
}

const darkInput: React.CSSProperties = {
  width: '100%',
  border: '1px solid #334155',
  background: '#0b1220',
  color: '#f8fafc',
  borderRadius: 10,
  padding: '12px 14px',
  marginBottom: 12,
  font: 'inherit',
}

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
                color: '#1c1917',
                border: '1px solid #ebe3d8',
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
  border: '1px solid #ebe3d8',
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

  // Modelo C: clientes (tenants) con BD propia + usuarios de acceso.
  const [clients, setClients] = useState<
    { id: string; slug: string; name: string; status: string; userCount: number }[]
  >([])
  const [users, setUsers] = useState<
    { id: string; email: string; name: string; role: string; status: string; tenantSlug: string; tenantName: string }[]
  >([])
  const [cName, setCName] = useState('')
  const [cSlug, setCSlug] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cPassword, setCPassword] = useState('')
  const [uEmail, setUEmail] = useState('')
  const [uPassword, setUPassword] = useState('')
  const [uTenant, setUTenant] = useState('')
  const [uRole, setURole] = useState('COACH')

  const loadClients = useCallback(async () => {
    const r = await fetch('/api/portal-central/admin/clients', { credentials: 'include' })
    if (r.ok) setClients((await r.json()).tenants || [])
  }, [])
  const loadUsers = useCallback(async () => {
    const r = await fetch('/api/portal-central/admin/users', { credentials: 'include' })
    if (r.ok) setUsers((await r.json()).users || [])
  }, [])

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
          await Promise.all([loadTenants(), loadClients(), loadUsers()])
        }
      })
      .catch(() => undefined)
  }, [loadTenants, loadClients, loadUsers])

  async function crearCliente() {
    setError('')
    setOkMsg('')
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/clients', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cName.trim(),
          slug: cSlug.trim() || undefined,
          adminEmail: cEmail.trim(),
          adminPassword: cPassword,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'No se pudo crear el cliente.')
      setCName(''); setCSlug(''); setCEmail(''); setCPassword('')
      await Promise.all([loadClients(), loadUsers()])
      setOkMsg(`Cliente «${data.tenant.slug}» creado y su CRM desplegado. Admin: ${data.admin}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function addUser() {
    setError('')
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: uEmail.trim(), password: uPassword, tenantSlug: uTenant, role: uRole }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'No se pudo crear el usuario.')
      setUEmail(''); setUPassword('')
      await loadUsers()
      setOkMsg('Usuario creado.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function toggleUser(userId: string, status: string) {
    setBusy(true)
    try {
      const next = status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
      const r = await fetch('/api/portal-central/admin/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, status: next }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error')
      await loadUsers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

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
      await Promise.all([loadTenants(), loadClients(), loadUsers()])
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
    background: '#292524',
    border: '1px solid #44403c',
    borderRadius: 14,
    padding: 24,
    marginBottom: 16,
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24, color: '#faf7f2' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>Panel admin del portal</h1>
      <p style={{ margin: '0 0 20px', color: '#a8a29e', lineHeight: 1.5, fontSize: 14 }}>
        Crea clientes (cada uno con su CRM y base de datos aislada) y sus usuarios de acceso.
        Todos entran por <strong>/portal</strong>.
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
          {/* Modelo C: crear cliente = desplegar su CRM */}
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Crear cliente</h2>
            <p style={{ margin: '0 0 14px', color: '#a8a29e', fontSize: 13, lineHeight: 1.5 }}>
              Crea su base de datos aislada y su administrador. El CRM queda disponible en{' '}
              <code>subdominio.tudominio</code>.
            </p>
            <label style={labelStyle}>Nombre del club</label>
            <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Club Voley Ejemplo" style={darkInput} />
            <label style={labelStyle}>Subdominio (opcional; se deriva del nombre)</label>
            <input value={cSlug} onChange={(e) => setCSlug(e.target.value)} placeholder="club-ejemplo" style={darkInput} />
            <label style={labelStyle}>Email del administrador</label>
            <input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="admin@club.com" style={darkInput} />
            <label style={labelStyle}>Contraseña del administrador</label>
            <input type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="mínimo 8 caracteres" style={darkInput} />
            <button
              type="button"
              disabled={busy || !cName.trim() || !cEmail.trim() || cPassword.length < 8}
              onClick={() => void crearCliente()}
              style={{ ...buttonStyle, opacity: busy || !cName.trim() || !cEmail.trim() || cPassword.length < 8 ? 0.6 : 1 }}
            >
              {busy ? 'Creando y desplegando…' : 'Crear cliente y desplegar CRM'}
            </button>
          </div>

          {/* Clientes creados */}
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Clientes ({clients.length})</h2>
            {clients.length === 0 ? (
              <p style={{ color: '#a8a29e', margin: 0 }}>Aún no hay clientes. Crea el primero arriba.</p>
            ) : (
              clients.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #44403c', padding: '10px 0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{c.name}</strong>
                    <div style={{ color: '#a8a29e', fontSize: 13 }}>
                      {c.slug} · {c.userCount} usuario{c.userCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: c.status === 'ACTIVE' ? 'rgba(74,222,128,.15)' : 'rgba(251,113,133,.15)', color: c.status === 'ACTIVE' ? '#4ade80' : '#fb7185' }}>
                    {c.status === 'ACTIVE' ? 'Activo' : 'Suspendido'}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Usuarios de acceso */}
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>Usuarios de acceso ({users.length})</h2>
            {clients.length > 0 && (
              <div style={{ border: '1px solid #44403c', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Añadir usuario a un cliente</div>
                <select value={uTenant} onChange={(e) => setUTenant(e.target.value)} style={darkInput}>
                  <option value="">— Elige cliente —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.slug}>{c.name} ({c.slug})</option>
                  ))}
                </select>
                <input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} placeholder="email@usuario.com" style={darkInput} />
                <input type="password" value={uPassword} onChange={(e) => setUPassword(e.target.value)} placeholder="contraseña (mín. 8)" style={darkInput} />
                <select value={uRole} onChange={(e) => setURole(e.target.value)} style={darkInput}>
                  <option value="ADMIN">Administrador</option>
                  <option value="COACH">Entrenador</option>
                  <option value="TREASURER">Tesorero</option>
                  <option value="MEMBER">Socio</option>
                </select>
                <button type="button" disabled={busy || !uTenant || !uEmail.trim() || uPassword.length < 8} onClick={() => void addUser()}
                  style={{ ...buttonStyle, opacity: busy || !uTenant || !uEmail.trim() || uPassword.length < 8 ? 0.6 : 1 }}>
                  Crear usuario
                </button>
              </div>
            )}
            {users.length === 0 ? (
              <p style={{ color: '#a8a29e', margin: 0 }}>Aún no hay usuarios.</p>
            ) : (
              users.map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #44403c', padding: '10px 0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ wordBreak: 'break-all' }}>{u.email}</strong>
                    <div style={{ color: '#a8a29e', fontSize: 13 }}>{u.tenantName} ({u.tenantSlug}) · {u.role}</div>
                  </div>
                  <button type="button" disabled={busy} onClick={() => void toggleUser(u.id, u.status)}
                    style={{ ...buttonStyle, width: 'auto', background: u.status === 'ACTIVE' ? 'transparent' : '#44403c', border: u.status === 'ACTIVE' ? '1px solid #fb7185' : 0, color: u.status === 'ACTIVE' ? '#fb7185' : '#faf7f2', fontSize: 12, padding: '8px 12px' }}>
                    {u.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              ))
            )}
          </div>

          <details style={{ ...cardStyle, opacity: 0.85 }}>
            <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>Avanzado: CRMs por URL (modelo antiguo)</summary>
            <div style={{ marginTop: 14 }}>
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
            <p style={{ margin: '0 0 12px', color: '#78716c', fontSize: 12, lineHeight: 1.5 }}>
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
              <p style={{ color: '#a8a29e', margin: 0 }}>Aún no hay CRMs.</p>
            ) : (
              tenants.map((t) => (
                <div
                  key={t.id}
                  style={{
                    border: '1px solid #44403c',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <strong>{t.name}</strong>
                  <div style={{ color: '#a8a29e', fontSize: 13, wordBreak: 'break-all' }}>
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
                      style={{ ...buttonStyle, width: 'auto', background: '#44403c' }}
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
          </details>
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
  border: '1px solid #44403c',
  background: '#0b1220',
  color: '#faf7f2',
  borderRadius: 10,
  padding: '12px 14px',
  marginBottom: 12,
  font: 'inherit',
}

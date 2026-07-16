'use client'

import { useCallback, useEffect, useState } from 'react'

type Tenant = { id: string; name: string; url: string; internalUrl?: string }

type PerClub = {
  slug: string
  name: string
  ok: boolean
  error?: string
  membersTotal: number
  membersActive: number
  membersOverdue: number
  incomeMonth: number
  pendingCount: number
  pendingAmount: number
}
type Metrics = {
  latest: {
    createdAt: string
    clubsTotal: number
    clubsActive: number
    tenantsOk: number
    tenantsFailed: number
    membersTotal: number
    membersActive: number
    membersOverdue: number
    incomeMonthTotal: number
    pendingCount: number
    pendingAmountTotal: number
    perClub: PerClub[]
  } | null
  history: {
    at: string
    membersActive: number
    membersTotal: number
    incomeMonthTotal: number
    pendingAmountTotal: number
  }[]
}

type PortalError = {
  id: string
  tenantSlug: string
  tenantName: string | null
  level: string
  source: string
  name: string | null
  message: string
  route: string | null
  count: number
  resolved: boolean
  firstSeenAt: string
  lastSeenAt: string
}
type ErrorsResponse = {
  summary: { unresolved: number; clubsAffected: number }
  errors: PortalError[]
}

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

  // Dashboard cross-club: último snapshot de KPIs + serie histórica.
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  // Bandeja central de errores por club.
  const [errors, setErrors] = useState<ErrorsResponse | null>(null)

  const loadClients = useCallback(async () => {
    const r = await fetch('/api/portal-central/admin/clients', { credentials: 'include' })
    if (r.ok) setClients((await r.json()).tenants || [])
  }, [])
  const loadUsers = useCallback(async () => {
    const r = await fetch('/api/portal-central/admin/users', { credentials: 'include' })
    if (r.ok) setUsers((await r.json()).users || [])
  }, [])
  const loadMetrics = useCallback(async () => {
    const r = await fetch('/api/portal-central/admin/metrics', { credentials: 'include' })
    if (r.ok) setMetrics(await r.json())
  }, [])
  const loadErrors = useCallback(async () => {
    const r = await fetch('/api/portal-central/admin/errors', { credentials: 'include' })
    if (r.ok) setErrors(await r.json())
  }, [])
  const resolveError = useCallback(async (id: string) => {
    await fetch('/api/portal-central/admin/errors', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, resolved: true }),
    })
    await loadErrors()
  }, [loadErrors])

  useEffect(() => {
    fetch('/api/portal-central/admin/login', { credentials: 'include' })
      .then((r) => r.json())
      .then(async (j) => {
        if (j.authenticated) {
          setAuthed(true)
          await Promise.all([loadMetrics(), loadErrors(), loadClients(), loadUsers()])
        }
      })
      .catch(() => undefined)
  }, [loadMetrics, loadErrors, loadClients, loadUsers])

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
      await Promise.all([loadMetrics(), loadErrors(), loadClients(), loadUsers()])
      setOkMsg('Sesión admin iniciada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
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
          <DashboardCard metrics={metrics} />
          <ErrorsCard data={errors} onResolve={resolveError} />

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

// ── Bandeja de errores por club ──────────────────────────────────────────────

function ErrorsCard({ data, onResolve }: { data: ErrorsResponse | null; onResolve: (id: string) => void }) {
  const cardStyle: React.CSSProperties = {
    background: '#292524',
    border: '1px solid #44403c',
    borderRadius: 14,
    padding: 24,
    marginBottom: 16,
  }
  if (!data) return null

  const errors = data.errors || []
  const unresolved = errors.filter((e) => !e.resolved)
  const levelColor = (lvl: string) => (lvl === 'FATAL' ? '#f87171' : lvl === 'WARN' ? '#fbbf24' : '#fb7185')

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Errores recientes</h2>
        <span style={{ fontSize: 12, color: unresolved.length ? '#fb7185' : '#4ade80' }}>
          {unresolved.length
            ? `${unresolved.length} sin resolver · ${data.summary.clubsAffected} club(es)`
            : 'sin errores pendientes'}
        </span>
      </div>

      {errors.length === 0 ? (
        <p style={{ margin: '10px 0 0', color: '#a8a29e', fontSize: 13, lineHeight: 1.55 }}>
          Ningún error registrado. Los fallos de servidor de cada club aparecen aquí agrupados por tipo.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {errors.map((e) => (
            <div
              key={e.id}
              style={{
                background: '#0b1220',
                border: '1px solid #44403c',
                borderRadius: 10,
                padding: '11px 13px',
                opacity: e.resolved ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: levelColor(e.level), border: `1px solid ${levelColor(e.level)}`, borderRadius: 6, padding: '1px 6px' }}>
                  {e.level}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#faf7f2' }}>{e.tenantName || e.tenantSlug}</span>
                <span style={{ fontSize: 11.5, color: '#a8a29e', fontFamily: 'ui-monospace, monospace' }}>{e.source}</span>
                {e.count > 1 ? (
                  <span style={{ fontSize: 11, color: '#fbbf24' }}>×{e.count}</span>
                ) : null}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#78716c' }}>{timeAgo(e.lastSeenAt)}</span>
                {!e.resolved ? (
                  <button
                    type="button"
                    onClick={() => onResolve(e.id)}
                    style={{ fontSize: 11, fontWeight: 600, color: '#4ade80', background: 'transparent', border: '1px solid #44403c', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', font: 'inherit' }}
                  >
                    Resolver
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: '#4ade80' }}>resuelto</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: '#e7e0d8', marginTop: 6, lineHeight: 1.45, wordBreak: 'break-word' }}>
                {e.name ? <b style={{ color: '#fca5a5' }}>{e.name}: </b> : null}
                {e.message.length > 240 ? `${e.message.slice(0, 240)}…` : e.message}
              </div>
              {e.route ? (
                <div style={{ fontSize: 11, color: '#78716c', marginTop: 3, fontFamily: 'ui-monospace, monospace' }}>{e.route}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Dashboard cross-club ─────────────────────────────────────────────────────

function fmtInt(n: number) {
  return Number(n || 0).toLocaleString('es-ES')
}
function fmtEur(n: number) {
  return `${Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`
}
function timeAgo(iso: string) {
  const then = new Date(iso).getTime()
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 90) return 'hace un momento'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  return `hace ${Math.round(hrs / 24)} d`
}

/** Sparkline SVG minimalista (serie de valores), tema oscuro, sin dependencias. */
function Sparkline({ data, color = '#5b8bff', width = 220, height = 40 }: {
  data: number[]
  color?: string
  width?: number
  height?: number
}) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = max - min || 1
  const stepX = width / (data.length - 1)
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8)
  const pts = data.map((v, i) => `${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `0,${height} ${pts} ${width},${height}`
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polygon points={area} fill={color} opacity="0.12" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) * stepX} cy={y(data[data.length - 1])} r="2.6" fill={color} />
    </svg>
  )
}

function KpiTile({ label, value, sub, accent }: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div style={{ flex: '1 1 130px', minWidth: 130, background: '#0b1220', border: '1px solid #44403c', borderRadius: 12, padding: '14px 15px' }}>
      <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#a8a29e', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent || '#faf7f2', marginTop: 6, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: '#a8a29e', marginTop: 3 }}>{sub}</div> : null}
    </div>
  )
}

function DashboardCard({ metrics }: { metrics: Metrics | null }) {
  const cardStyle: React.CSSProperties = {
    background: '#292524',
    border: '1px solid #44403c',
    borderRadius: 14,
    padding: 24,
    marginBottom: 16,
  }

  const latest = metrics?.latest ?? null
  const history = metrics?.history ?? []

  if (!metrics) {
    return (
      <div style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Dashboard</h2>
        <p style={{ margin: '10px 0 0', color: '#a8a29e', fontSize: 13 }}>Cargando métricas…</p>
      </div>
    )
  }

  if (!latest) {
    return (
      <div style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Dashboard</h2>
        <p style={{ margin: '10px 0 0', color: '#a8a29e', fontSize: 13, lineHeight: 1.55 }}>
          Aún no hay datos agregados. El CRM genera el primer resumen unos segundos después de
          arrancar y lo recalcula cada hora. Vuelve en un momento.
        </p>
      </div>
    )
  }

  // Socios por club (activos), ordenado de más a menos, para las barras.
  const clubs = [...(latest.perClub || [])]
    .filter((c) => c.ok)
    .sort((a, b) => b.membersActive - a.membersActive)
  const maxMembers = Math.max(1, ...clubs.map((c) => c.membersActive))
  const failed = (latest.perClub || []).filter((c) => !c.ok)

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Dashboard</h2>
        <span style={{ fontSize: 12, color: '#78716c' }}>
          Actualizado {timeAgo(latest.createdAt)} · se recalcula cada hora
        </span>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
        <KpiTile
          label="Clubes"
          value={fmtInt(latest.clubsActive)}
          sub={latest.clubsTotal !== latest.clubsActive ? `${fmtInt(latest.clubsTotal)} en total` : 'activos'}
          accent="#5b8bff"
        />
        <KpiTile
          label="Socios"
          value={fmtInt(latest.membersActive)}
          sub={`${fmtInt(latest.membersTotal)} en total`}
        />
        <KpiTile
          label="Ingresos (mes)"
          value={fmtEur(latest.incomeMonthTotal)}
          sub="suma de todos los clubes"
          accent="#4ade80"
        />
        <KpiTile
          label="Cobros pendientes"
          value={fmtEur(latest.pendingAmountTotal)}
          sub={`${fmtInt(latest.pendingCount)} factura(s)`}
          accent={latest.pendingAmountTotal > 0 ? '#fbbf24' : undefined}
        />
      </div>

      {/* Tendencia de socios activos */}
      {history.length > 1 ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#a8a29e', fontWeight: 600, marginBottom: 6 }}>
            Socios activos · últimas {history.length} tomas
          </div>
          <Sparkline data={history.map((h) => h.membersActive)} />
        </div>
      ) : null}

      {/* Socios por club */}
      {clubs.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#a8a29e', fontWeight: 600, marginBottom: 10 }}>
            Socios activos por club
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {clubs.map((c) => (
              <div key={c.slug} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 130, minWidth: 130, fontSize: 13, color: '#faf7f2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${c.name} (${c.slug})`}>
                  {c.name}
                </div>
                <div style={{ flex: 1, background: '#0b1220', borderRadius: 6, height: 20, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round((c.membersActive / maxMembers) * 100)}%`, height: '100%', background: '#2563eb', borderRadius: 6, minWidth: c.membersActive > 0 ? 4 : 0 }} />
                </div>
                <div style={{ width: 42, textAlign: 'right', fontSize: 13, color: '#a8a29e', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtInt(c.membersActive)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Clubes cuya agregación falló (aviso operativo) */}
      {failed.length > 0 ? (
        <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 10, background: 'rgba(251,113,133,.10)', border: '1px solid rgba(251,113,133,.35)' }}>
          <div style={{ fontSize: 13, color: '#fb7185', fontWeight: 600 }}>
            {failed.length} club(es) no respondieron al recalcular:
          </div>
          <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 4, lineHeight: 1.5 }}>
            {failed.map((c) => `${c.name} (${c.error || 'error'})`).join(' · ')}
          </div>
        </div>
      ) : null}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { CRM_MODULES } from '@/lib/crm-modules'

/* ── Sistema de diseño del panel admin (calcado de Stitch · "Velocity Carbon") ──
   Carbón cálido oscuro, acento rojo ProClubCRM (#e11d48), verde esmeralda para
   estados activos, tarjetas redondeadas y chips píldora. */
const PC = {
  bg: '#0a0a0a',
  sidebar: '#0d0d0d',
  card: '#171717',
  card2: '#1c1c1c',
  inset: '#111111',
  border: '#262626',
  border2: '#333333',
  text: '#fafafa',
  sub: '#a3a3a3',
  muted: '#737373',
  primary: '#e11d48',
  primaryHover: '#be123c',
  green: '#10b981',
  greenBg: 'rgba(16,185,129,.12)',
  amber: '#f59e0b',
  danger: '#fb7185',
} as const

const aCard: React.CSSProperties = {
  background: PC.card,
  border: `1px solid ${PC.border}`,
  borderRadius: 20,
  padding: 24,
}
const aBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  border: 0, borderRadius: 10, padding: '11px 16px',
  background: PC.primary, color: '#fff', fontWeight: 700, fontSize: 13.5,
  cursor: 'pointer', font: 'inherit',
}
const aBtnGhost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  border: `1px solid ${PC.border2}`, borderRadius: 10, padding: '9px 14px',
  background: 'transparent', color: PC.text, fontWeight: 600, fontSize: 12.5,
  cursor: 'pointer', font: 'inherit',
}

/** Icono de marca (corredor rojo, como el favicon). */
function RunnerMark({ size = 30 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 9, background: PC.primary, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="#fff" aria-hidden>
        <circle cx="15.5" cy="5" r="2.3" />
        <path d="M5.5 21a1.15 1.15 0 0 1-1-1.75l3.2-5.2-2.1-1.7a1.15 1.15 0 0 1 1.45-1.8l3 2.4 2.1-3.4-3.3-1.1a1.15 1.15 0 1 1 .74-2.18l5.1 1.72c.5.17.83.66.78 1.19l-.35 3.6 3.1 1.9a1.15 1.15 0 1 1-1.2 1.96l-3.6-2.2a1.2 1.2 0 0 1-.55-1.15l.18-1.9-2.05 3.3a1.15 1.15 0 0 1-.24.27l-3.6 5.85c-.21.34-.58.54-.98.54Z" />
      </svg>
    </span>
  )
}

const NAV_ICONS: Record<string, React.ReactNode> = {
  dash: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  clubs: <><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>,
  activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  errors: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
}

const PORTAL_NAV = [
  { id: 'sec-dashboard', label: 'Dashboard', icon: 'dash' },
  { id: 'sec-clientes', label: 'Clubes', icon: 'clubs' },
  { id: 'sec-usuarios', label: 'Usuarios', icon: 'users' },
  { id: 'sec-actividad', label: 'Actividad', icon: 'activity' },
  { id: 'sec-errores', label: 'Errores', icon: 'errors' },
] as const

function PortalSidebar({ onNav }: { onNav: (id: string) => void }) {
  const [active, setActive] = useState('sec-dashboard')
  return (
    <aside style={{ width: 250, flexShrink: 0, background: PC.sidebar, borderRight: `1px solid ${PC.border}`, position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', padding: '22px 16px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 22px' }}>
        <RunnerMark />
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.03em', color: PC.text }}>ProClubCRM</span>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {PORTAL_NAV.map((it) => {
          const on = active === it.id
          return (
            <button key={it.id} type="button"
              onClick={() => { setActive(it.id); onNav(it.id) }}
              style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 9, border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left',
                background: on ? 'rgba(225,29,72,.14)' : 'transparent',
                color: on ? '#fff' : PC.sub, fontSize: 13.5, fontWeight: on ? 600 : 500 }}>
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={on ? PC.primary : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{NAV_ICONS[it.icon]}</svg>
              {it.label}
            </button>
          )
        })}
      </nav>
      <button type="button" onClick={() => onNav('sec-crear')} style={{ ...aBtn, width: '100%', marginTop: 18 }}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Nuevo cliente
      </button>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 8px 0', borderTop: `1px solid ${PC.border}` }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(225,29,72,.15)', color: PC.primary, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 }}>SA</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: PC.text }}>Super Admin</div>
          <div style={{ fontSize: 11.5, color: PC.muted }}>Portal ProClubCRM</div>
        </div>
      </div>
    </aside>
  )
}

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

type AuditRow = {
  id: string
  actor: string
  action: string
  tenantSlug: string | null
  tenantName: string | null
  detail: unknown
  ip: string | null
  createdAt: string
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
    { id: string; slug: string; name: string; status: string; userCount: number; features?: Record<string, boolean> }[]
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
  // Registro de acciones del super-admin.
  const [audit, setAudit] = useState<AuditRow[] | null>(null)

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
    try {
      const r = await fetch('/api/portal-central/admin/errors', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resolved: true }),
      })
      if (!r.ok) {
        setError((await r.json().catch(() => ({}))).error || 'No se pudo marcar como resuelto.')
        return
      }
      await loadErrors()
    } catch {
      setError('Error de red al marcar el error como resuelto.')
    }
  }, [loadErrors])
  const loadAudit = useCallback(async () => {
    const r = await fetch('/api/portal-central/admin/audit', { credentials: 'include' })
    if (r.ok) setAudit((await r.json()).audit || [])
  }, [])

  /** Suspender / reactivar un club. */
  const toggleClient = useCallback(async (id: string, status: string) => {
    const next = status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/clients', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: next }),
      })
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'No se pudo cambiar el estado.'); return }
      setOkMsg(next === 'SUSPENDED' ? 'Club suspendido.' : 'Club reactivado.')
      await Promise.all([loadClients(), loadAudit()])
    } catch {
      setError('Error de red al cambiar el estado del club.')
    } finally {
      setBusy(false)
    }
  }, [loadClients, loadAudit])

  /** Activa/desactiva un módulo (feature flag) de un club. */
  const toggleClientModule = useCallback(async (id: string, moduleId: string, current: Record<string, boolean> | undefined) => {
    // features: solo se guardan las desactivaciones (ausente = activado).
    const next = { ...(current || {}) }
    if (next[moduleId] === false) delete next[moduleId] // reactivar
    else next[moduleId] = false // desactivar
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/clients', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, features: next }),
      })
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'No se pudo cambiar el módulo.'); return }
      await Promise.all([loadClients(), loadAudit()])
    } catch {
      setError('Error de red al cambiar el módulo.')
    } finally {
      setBusy(false)
    }
  }, [loadClients, loadAudit])

  /** "Entrar como" el admin del club: navega al CRM con una sesión SSO. */
  const impersonateClient = useCallback(async (id: string) => {
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/impersonate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: id }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data.redirectUrl) {
        setError(data.error || 'No se pudo entrar al club.')
        return
      }
      // El SSO abre la sesión en el CRM del club (en una pestaña nueva).
      window.open(data.redirectUrl, '_blank', 'noopener')
    } catch {
      setError('Error de red al entrar al club.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    fetch('/api/portal-central/admin/login', { credentials: 'include' })
      .then((r) => r.json())
      .then(async (j) => {
        if (j.authenticated) {
          setAuthed(true)
          await Promise.all([loadMetrics(), loadErrors(), loadAudit(), loadClients(), loadUsers()])
        }
      })
      .catch(() => undefined)
  }, [loadMetrics, loadErrors, loadAudit, loadClients, loadUsers])

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
      await Promise.all([loadMetrics(), loadErrors(), loadAudit(), loadClients(), loadUsers()])
      setOkMsg('Sesión admin iniciada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const scrollToId = (id: string) => {
    if (typeof document === 'undefined') return
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const badge = (ok: boolean, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '4px 11px', borderRadius: 999, background: ok ? PC.greenBg : 'rgba(251,113,133,.14)', color: ok ? PC.green : PC.danger }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? PC.green : PC.danger }} />
      {label}
    </span>
  )

  const sectionTitle = (t: string, sub?: string) => (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: PC.text }}>{t}</h2>
      {sub ? <p style={{ margin: '4px 0 0', color: PC.sub, fontSize: 13, lineHeight: 1.5 }}>{sub}</p> : null}
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: PC.bg, color: PC.text }}>
      {authed ? <PortalSidebar onNav={scrollToId} /> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: authed ? 1180 : 440, margin: authed ? 0 : '0 auto', padding: authed ? '30px 40px 64px' : '64px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Cabecera */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em', color: PC.text }}>Panel admin del portal</h1>
              <p style={{ margin: '7px 0 0', color: PC.sub, lineHeight: 1.5, fontSize: 14, maxWidth: 580 }}>
                Crea clientes (cada uno con su CRM y base de datos aislada) y sus usuarios de acceso.
                Todos entran por <strong style={{ color: PC.text, fontWeight: 600 }}>/portal</strong>.
              </p>
            </div>
            {authed ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" onClick={() => scrollToId('sec-crear')} style={aBtn}>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Nuevo cliente
                </button>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: PC.card, border: `1px solid ${PC.border}`, display: 'grid', placeItems: 'center', color: PC.sub, fontWeight: 700, fontSize: 13 }}>SA</div>
              </div>
            ) : null}
          </div>

          {error ? <Msg kind="error" text={error} onClose={() => setError('')} /> : null}
          {okMsg ? <Msg kind="ok" text={okMsg} onClose={() => setOkMsg('')} /> : null}

          {!authed ? (
            <div style={aCard}>
              <label style={labelStyle}>Contraseña admin</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void adminLogin() }}
                style={darkInput}
              />
              <button type="button" disabled={busy} onClick={() => void adminLogin()} style={{ ...aBtn, width: '100%', opacity: busy ? 0.6 : 1 }}>
                Entrar al panel
              </button>
            </div>
          ) : (
            <>
              <section id="sec-dashboard"><DashboardCard metrics={metrics} /></section>

              <div id="sec-errores" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 16 }}>
                <ErrorsCard data={errors} onResolve={resolveError} />
                <div id="sec-actividad"><AuditCard rows={audit} /></div>
              </div>

              {/* Clientes creados */}
              <section id="sec-clientes" style={aCard}>
                {sectionTitle(`Clubes (${clients.length})`, 'Cada club tiene su CRM y base de datos aislada.')}
                {clients.length === 0 ? (
                  <p style={{ color: PC.sub, margin: '16px 0 0', fontSize: 14 }}>Aún no hay clubes. Crea el primero abajo.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                    {clients.map((c) => (
                      <div key={c.id} style={{ background: PC.card2, border: `1px solid ${PC.border}`, borderRadius: 14, padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: PC.text }}>{c.name}</div>
                            <div style={{ color: PC.muted, fontSize: 12.5, marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
                              {c.slug} · {c.userCount} usuario{c.userCount === 1 ? '' : 's'}
                            </div>
                          </div>
                          {badge(c.status === 'ACTIVE', c.status === 'ACTIVE' ? 'Activo' : 'Suspendido')}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void impersonateClient(c.id)}
                            title="Entrar al CRM de este club como su administrador (soporte)"
                            style={aBtnGhost}
                          >
                            Entrar como
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void toggleClient(c.id, c.status)}
                            style={{ ...aBtnGhost, borderColor: c.status === 'ACTIVE' ? 'rgba(251,113,133,.5)' : PC.border2, color: c.status === 'ACTIVE' ? PC.danger : PC.text }}
                          >
                            {c.status === 'ACTIVE' ? 'Suspender' : 'Reactivar'}
                          </button>
                        </div>
                        {/* Módulos del plan: chip verde = activado, gris = apagado. Clic para alternar. */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: PC.muted, marginRight: 2, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Módulos</span>
                          {CRM_MODULES.map((m) => {
                            const on = c.features?.[m.id] !== false
                            return (
                              <button
                                key={m.id}
                                type="button"
                                disabled={busy}
                                onClick={() => void toggleClientModule(c.id, m.id, c.features)}
                                title={on ? `Desactivar ${m.label}` : `Activar ${m.label}`}
                                style={{
                                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', font: 'inherit',
                                  background: on ? PC.greenBg : 'transparent',
                                  border: `1px solid ${on ? 'rgba(16,185,129,.5)' : PC.border2}`,
                                  color: on ? PC.green : PC.muted,
                                }}
                              >
                                {on ? '✓ ' : '✕ '}{m.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Modelo C: crear cliente = desplegar su CRM */}
              <section id="sec-crear" style={aCard}>
                {sectionTitle('Crear cliente', 'Crea su base de datos aislada y su administrador. El CRM queda disponible en subdominio.tudominio.')}
                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 16px' }}>
                  <div>
                    <label style={labelStyle}>Nombre del club</label>
                    <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Club Voley Ejemplo" style={darkInput} />
                  </div>
                  <div>
                    <label style={labelStyle}>Subdominio (opcional)</label>
                    <input value={cSlug} onChange={(e) => setCSlug(e.target.value)} placeholder="club-ejemplo" style={darkInput} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email del administrador</label>
                    <input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="admin@club.com" style={darkInput} />
                  </div>
                  <div>
                    <label style={labelStyle}>Contraseña del administrador</label>
                    <input type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="mínimo 8 caracteres" style={darkInput} />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy || !cName.trim() || !cEmail.trim() || cPassword.length < 8}
                  onClick={() => void crearCliente()}
                  style={{ ...aBtn, marginTop: 4, opacity: busy || !cName.trim() || !cEmail.trim() || cPassword.length < 8 ? 0.5 : 1 }}
                >
                  {busy ? 'Creando y desplegando…' : 'Crear cliente y desplegar CRM'}
                </button>
              </section>

              {/* Usuarios de acceso */}
              <section id="sec-usuarios" style={aCard}>
                {sectionTitle(`Usuarios de acceso (${users.length})`)}
                {clients.length > 0 && (
                  <div style={{ background: PC.card2, border: `1px solid ${PC.border}`, borderRadius: 14, padding: 16, margin: '16px 0' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: PC.text }}>Añadir usuario a un cliente</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 16px' }}>
                      <div>
                        <label style={labelStyle}>Club</label>
                        <select value={uTenant} onChange={(e) => setUTenant(e.target.value)} style={darkInput}>
                          <option value="">— Elige cliente —</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.slug}>{c.name} ({c.slug})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Rol</label>
                        <select value={uRole} onChange={(e) => setURole(e.target.value)} style={darkInput}>
                          <option value="ADMIN">Administrador</option>
                          <option value="COACH">Entrenador</option>
                          <option value="TREASURER">Tesorero</option>
                          <option value="MEMBER">Socio</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Email</label>
                        <input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} placeholder="email@usuario.com" style={darkInput} />
                      </div>
                      <div>
                        <label style={labelStyle}>Contraseña</label>
                        <input type="password" value={uPassword} onChange={(e) => setUPassword(e.target.value)} placeholder="mín. 8 caracteres" style={darkInput} />
                      </div>
                    </div>
                    <button type="button" disabled={busy || !uTenant || !uEmail.trim() || uPassword.length < 8} onClick={() => void addUser()}
                      style={{ ...aBtn, opacity: busy || !uTenant || !uEmail.trim() || uPassword.length < 8 ? 0.5 : 1 }}>
                      Crear usuario
                    </button>
                  </div>
                )}
                {users.length === 0 ? (
                  <p style={{ color: PC.sub, margin: '16px 0 0', fontSize: 14 }}>Aún no hay usuarios.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {users.map((u) => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${PC.border}`, padding: '12px 0' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ wordBreak: 'break-all', color: PC.text, fontSize: 14 }}>{u.email}</strong>
                          <div style={{ color: PC.muted, fontSize: 12.5, marginTop: 2 }}>{u.tenantName} ({u.tenantSlug}) · {u.role}</div>
                        </div>
                        <button type="button" disabled={busy} onClick={() => void toggleUser(u.id, u.status)}
                          style={{ ...aBtnGhost, borderColor: u.status === 'ACTIVE' ? 'rgba(251,113,133,.5)' : PC.border2, color: u.status === 'ACTIVE' ? PC.danger : PC.text }}>
                          {u.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
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
        margin: 0,
        padding: '12px 14px',
        borderRadius: 12,
        fontSize: 14,
        border: `1px solid ${kind === 'error' ? 'rgba(251,113,133,.3)' : 'rgba(16,185,129,.3)'}`,
        background: kind === 'error' ? 'rgba(251,113,133,.12)' : PC.greenBg,
        color: kind === 'error' ? PC.danger : PC.green,
      }}
    >
      {text}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 600,
  color: PC.sub,
  marginBottom: 6,
}

const darkInput: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${PC.border}`,
  background: PC.inset,
  color: PC.text,
  borderRadius: 10,
  padding: '11px 13px',
  marginBottom: 12,
  font: 'inherit',
  boxSizing: 'border-box',
}

// ── Registro de acciones del super-admin ─────────────────────────────────────

const AUDIT_LABEL: Record<string, string> = {
  SUSPEND: 'Suspendió el club',
  REACTIVATE: 'Reactivó el club',
  IMPERSONATE: 'Entró como admin',
  CREATE_CLIENT: 'Creó el club',
  UPDATE_FEATURES: 'Cambió los módulos',
  CREATE_USER: 'Creó un usuario',
  DISABLE_USER: 'Desactivó un usuario',
  ENABLE_USER: 'Activó un usuario',
  RESET_PASSWORD: 'Reseteó una contraseña',
}
const AUDIT_COLOR: Record<string, string> = {
  SUSPEND: '#fb7185',
  REACTIVATE: '#10b981',
  IMPERSONATE: '#f59e0b',
  CREATE_CLIENT: '#e11d48',
}

function AuditCard({ rows }: { rows: AuditRow[] | null }) {
  const cardStyle: React.CSSProperties = {
    background: PC.card,
    border: `1px solid ${PC.border}`,
    borderRadius: 20,
    padding: 24,
  }
  if (!rows) return null

  return (
    <div style={cardStyle}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: PC.text }}>Actividad reciente</h2>
      {rows.length === 0 ? (
        <p style={{ margin: '10px 0 0', color: PC.sub, fontSize: 13, lineHeight: 1.55 }}>
          Aquí queda registro de las acciones sensibles (suspender, entrar como, crear clientes…).
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 14 }}>
          {rows.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, padding: '9px 0', borderBottom: `1px solid ${PC.border}`, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: AUDIT_COLOR[a.action] || PC.text }}>
                {AUDIT_LABEL[a.action] || a.action}
              </span>
              {a.tenantName || a.tenantSlug ? (
                <span style={{ color: PC.sub }}>· {a.tenantName || a.tenantSlug}</span>
              ) : null}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: PC.muted, fontFamily: 'ui-monospace, monospace' }}>
                {a.ip ? `${a.ip} · ` : ''}{timeAgo(a.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Bandeja de errores por club ──────────────────────────────────────────────

function ErrorsCard({ data, onResolve }: { data: ErrorsResponse | null; onResolve: (id: string) => void }) {
  const cardStyle: React.CSSProperties = {
    background: PC.card,
    border: `1px solid ${PC.border}`,
    borderRadius: 20,
    padding: 24,
  }
  if (!data) return null

  const errors = data.errors || []
  const unresolved = errors.filter((e) => !e.resolved)
  const levelColor = (lvl: string) => (lvl === 'FATAL' ? '#f87171' : lvl === 'WARN' ? '#fbbf24' : '#fb7185')

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: PC.text }}>Errores recientes</h2>
        <span style={{ fontSize: 12, fontWeight: 600, color: unresolved.length ? PC.danger : PC.green }}>
          {unresolved.length
            ? `${unresolved.length} sin resolver · ${data.summary.clubsAffected} club(es)`
            : '✓ sin errores pendientes'}
        </span>
      </div>

      {errors.length === 0 ? (
        <p style={{ margin: '10px 0 0', color: PC.sub, fontSize: 13, lineHeight: 1.55 }}>
          Ningún error registrado. Los fallos de servidor de cada club aparecen aquí agrupados por tipo.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {errors.map((e) => (
            <div
              key={e.id}
              style={{
                background: PC.inset,
                border: `1px solid ${PC.border}`,
                borderRadius: 12,
                padding: '11px 13px',
                opacity: e.resolved ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', color: levelColor(e.level), border: `1px solid ${levelColor(e.level)}`, borderRadius: 6, padding: '1px 6px' }}>
                  {e.level}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: PC.text }}>{e.tenantName || e.tenantSlug}</span>
                <span style={{ fontSize: 11.5, color: PC.sub, fontFamily: 'ui-monospace, monospace' }}>{e.source}</span>
                {e.count > 1 ? (
                  <span style={{ fontSize: 11, color: PC.amber }}>×{e.count}</span>
                ) : null}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: PC.muted }}>{timeAgo(e.lastSeenAt)}</span>
                {!e.resolved ? (
                  <button
                    type="button"
                    onClick={() => void onResolve(e.id)}
                    style={{ fontSize: 11, fontWeight: 600, color: PC.green, background: 'transparent', border: `1px solid ${PC.border2}`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', font: 'inherit' }}
                  >
                    Resolver
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: PC.green }}>resuelto</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: '#d4d4d4', marginTop: 6, lineHeight: 1.45, wordBreak: 'break-word' }}>
                {e.name ? <b style={{ color: '#fca5a5' }}>{e.name}: </b> : null}
                {e.message.length > 240 ? `${e.message.slice(0, 240)}…` : e.message}
              </div>
              {e.route ? (
                <div style={{ fontSize: 11, color: PC.muted, marginTop: 3, fontFamily: 'ui-monospace, monospace' }}>{e.route}</div>
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
function Sparkline({ data, color = '#e11d48', width = 220, height = 40 }: {
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

function KpiTile({ label, value, sub, icon, color = PC.primary }: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
  color?: string
}) {
  return (
    <div style={{ background: PC.card, border: `1px solid ${PC.border}`, borderRadius: 20, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: PC.muted, fontWeight: 600 }}>{label}</span>
        {icon ? (
          <span style={{ width: 34, height: 34, borderRadius: 10, background: `${color}22`, color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</span>
        ) : null}
      </div>
      <div>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', color: PC.text, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {sub ? <div style={{ fontSize: 12.5, color: PC.sub, marginTop: 5 }}>{sub}</div> : null}
      </div>
    </div>
  )
}

function kpiIcon(paths: React.ReactNode) {
  return <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
}

function DashboardCard({ metrics }: { metrics: Metrics | null }) {
  const cardStyle: React.CSSProperties = {
    background: PC.card,
    border: `1px solid ${PC.border}`,
    borderRadius: 20,
    padding: 24,
  }

  const latest = metrics?.latest ?? null
  const history = metrics?.history ?? []

  if (!metrics) {
    return (
      <div style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: PC.text }}>Dashboard</h2>
        <p style={{ margin: '10px 0 0', color: PC.sub, fontSize: 13 }}>Cargando métricas…</p>
      </div>
    )
  }

  if (!latest) {
    return (
      <div style={cardStyle}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: PC.text }}>Dashboard</h2>
        <p style={{ margin: '10px 0 0', color: PC.sub, fontSize: 13, lineHeight: 1.55 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs como tarjetas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
        <KpiTile
          label="Clubes activos"
          value={fmtInt(latest.clubsActive)}
          sub={latest.clubsTotal !== latest.clubsActive ? `${fmtInt(latest.clubsTotal)} en total` : 'activos'}
          color={PC.primary}
          icon={kpiIcon(<><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></>)}
        />
        <KpiTile
          label="Socios totales"
          value={fmtInt(latest.membersActive)}
          sub={`${fmtInt(latest.membersTotal)} en total`}
          color="#60a5fa"
          icon={kpiIcon(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>)}
        />
        <KpiTile
          label="Ingresos (mes)"
          value={fmtEur(latest.incomeMonthTotal)}
          sub="suma de todos los clubes"
          color={PC.green}
          icon={kpiIcon(<><path d="M14.5 8a3.5 4 0 1 0 0 8" /><line x1="4" y1="10.5" x2="12" y2="10.5" /><line x1="4" y1="13.5" x2="11" y2="13.5" /></>)}
        />
        <KpiTile
          label="Cobros pendientes"
          value={fmtEur(latest.pendingAmountTotal)}
          sub={`${fmtInt(latest.pendingCount)} factura(s)`}
          color={latest.pendingAmountTotal > 0 ? PC.amber : PC.muted}
          icon={kpiIcon(<><path d="M4 3h16v18l-3-2-2 2-3-2-3 2-2-2-3 2Z" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="14" y2="12" /></>)}
        />
      </div>

      {/* Actividad de socios */}
      {history.length > 1 || clubs.length > 0 || failed.length > 0 ? (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: PC.text }}>Actividad de socios</h2>
            <span style={{ fontSize: 12, color: PC.muted }}>
              Actualizado {timeAgo(latest.createdAt)} · se recalcula cada hora
            </span>
          </div>

          {history.length > 1 ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: PC.muted, fontWeight: 600, marginBottom: 8 }}>
                Socios activos · últimas {history.length} tomas
              </div>
              <Sparkline data={history.map((h) => h.membersActive)} />
            </div>
          ) : null}

          {clubs.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: PC.muted, fontWeight: 600, marginBottom: 12 }}>
                Socios activos por club
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {clubs.map((c) => (
                  <div key={c.slug} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 120, minWidth: 120, fontSize: 13, color: PC.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${c.name} (${c.slug})`}>
                      {c.name}
                    </div>
                    <div style={{ flex: 1, background: PC.inset, borderRadius: 999, height: 10, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round((c.membersActive / maxMembers) * 100)}%`, height: '100%', background: PC.primary, borderRadius: 999, minWidth: c.membersActive > 0 ? 6 : 0 }} />
                    </div>
                    <div style={{ width: 38, textAlign: 'right', fontSize: 13, color: PC.sub, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtInt(c.membersActive)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {failed.length > 0 ? (
            <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 12, background: 'rgba(251,113,133,.10)', border: '1px solid rgba(251,113,133,.35)' }}>
              <div style={{ fontSize: 13, color: PC.danger, fontWeight: 600 }}>
                {failed.length} club(es) no respondieron al recalcular:
              </div>
              <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 4, lineHeight: 1.5 }}>
                {failed.map((c) => `${c.name} (${c.error || 'error'})`).join(' · ')}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

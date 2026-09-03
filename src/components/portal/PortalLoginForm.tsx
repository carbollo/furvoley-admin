// @ts-nocheck
'use client'

import { useCallback, useEffect, useState } from 'react'
import { CRM_SECTIONS } from '@/lib/crm-modules'
import { track } from '@/lib/analytics/umami'

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
  plans: <><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
}

const PORTAL_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dash' },
  { id: 'clubes', label: 'Clubes', icon: 'clubs' },
  { id: 'planes', label: 'Planes', icon: 'plans' },
  { id: 'usuarios', label: 'Usuarios', icon: 'users' },
  { id: 'actividad', label: 'Actividad', icon: 'activity' },
  { id: 'errores', label: 'Errores', icon: 'errors' },
  { id: 'admins', label: 'Admins', icon: 'shield' },
] as const

function PortalSidebar({ active, onSelect, onLogout, identity }: { active: string; onSelect: (id: string) => void; onLogout: () => void; identity?: string | null }) {
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
              onClick={() => onSelect(it.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 9, border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left',
                background: on ? 'rgba(225,29,72,.14)' : 'transparent',
                color: on ? '#fff' : PC.sub, fontSize: 13.5, fontWeight: on ? 600 : 500 }}>
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={on ? PC.primary : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{NAV_ICONS[it.icon]}</svg>
              {it.label}
            </button>
          )
        })}
      </nav>
      <button type="button" onClick={() => onSelect('clubes')} style={{ ...aBtn, width: '100%', marginTop: 18 }}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Nuevo cliente
      </button>
      <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: `1px solid ${PC.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 12px' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(225,29,72,.15)', color: PC.primary, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 }}>SA</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: PC.text }}>Super Admin</div>
            <div style={{ fontSize: 11.5, color: PC.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{identity && identity !== 'master' ? identity : 'Portal ProClubCRM'}</div>
          </div>
        </div>
        <button type="button" onClick={onLogout} style={{ ...aBtnGhost, width: '100%' }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          Cerrar sesión
        </button>
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

  // --- Fases 1-3 ---
  const [loginEmail, setLoginEmail] = useState('') // login de super-admin (email+contraseña)
  const [identity, setIdentity] = useState(null)   // quién es la sesión ('master' o email)
  const [view, setView] = useState('dashboard')    // pestaña activa
  const [plans, setPlans] = useState([])           // planes comerciales
  /** Dirección pública canónica del portal, según el servidor. */
  const [portalPublicUrl, setPortalPublicUrl] = useState('')
  const [admins, setAdmins] = useState([])         // super-admins
  const [auditAction, setAuditAction] = useState('') // filtro de auditoría
  const [editClient, setEditClient] = useState(null) // club en edición (modal)
  const [planModal, setPlanModal] = useState(null)   // plan en alta/edición (modal)
  const [resendInfo, setResendInfo] = useState(null) // { email, tempPassword } tras reenviar acceso
  const [naEmail, setNaEmail] = useState('')         // nuevo super-admin
  const [naPassword, setNaPassword] = useState('')
  const [naName, setNaName] = useState('')
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null) // ¿se puede mandar correo?
  const [mailTransporte, setMailTransporte] = useState<string | null>(null) // 'resend' | 'smtp'
  const [smtpTestTo, setSmtpTestTo] = useState('')   // destino del correo de prueba
  const [split, setSplit] = useState(null)           // reparto de beneficios { selfPct, otherPct, selfLabel, otherLabel }
  const [impModal, setImpModal] = useState(null)     // { id, name } al "entrar como" (pide motivo)
  const [impReason, setImpReason] = useState('')     // motivo del acceso
  const [activityModal, setActivityModal] = useState(null) // { slug, name, rows } timeline de soporte por club
  // Debe coincidir con NO_SUSPEND_TAG de @/lib/portal-central/portal-store (no se
  // importa aquí para no arrastrar código de servidor al bundle del cliente).
  const NO_SUSPEND_TAG = 'no-suspender'

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
  const loadProfitSplit = useCallback(async () => {
    const r = await fetch('/api/portal-central/admin/profit-split', { credentials: 'include' })
    if (r.ok) setSplit(await r.json())
  }, [])
  const saveProfitSplit = useCallback(async (patch: { selfPct?: number; selfLabel?: string; otherLabel?: string }) => {
    const r = await fetch('/api/portal-central/admin/profit-split', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (r.ok) { setSplit(await r.json()); return true }
    setError((await r.json().catch(() => ({}))).error || 'No se pudo guardar el reparto.')
    return false
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
  const loadAudit = useCallback(async (action = '') => {
    const qs = action ? `?action=${encodeURIComponent(action)}` : ''
    const r = await fetch('/api/portal-central/admin/audit' + qs, { credentials: 'include' })
    if (r.ok) setAudit((await r.json()).audit || [])
  }, [])
  const loadPlans = useCallback(async () => {
    const r = await fetch('/api/portal-central/admin/plans', { credentials: 'include' })
    if (!r.ok) return
    const data = await r.json()
    setPlans(data.plans || [])
    setPortalPublicUrl(String(data.publicUrl || ''))
  }, [])
  const loadAdmins = useCallback(async () => {
    const r = await fetch('/api/portal-central/admin/admins', { credentials: 'include' })
    if (r.ok) setAdmins((await r.json()).admins || [])
  }, [])
  const loadSmtp = useCallback(async () => {
    const r = await fetch('/api/portal-central/admin/smtp-test', { credentials: 'include' })
    if (!r.ok) return
    const j = await r.json().catch(() => ({}))
    setSmtpConfigured(Boolean(j.configured))
    setMailTransporte(j.transporte || null)
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

  /** "Entrar como" el admin del club: navega al CRM con una sesión SSO. Requiere motivo. */
  const impersonateClient = useCallback(async (id: string, reason: string) => {
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/impersonate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: id, reason }),
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

  /** Timeline de soporte de un club: su actividad en la auditoría (por tenantSlug). */
  const openActivity = useCallback(async (slug: string, name: string) => {
    setActivityModal({ slug, name, rows: null })
    try {
      const r = await fetch(`/api/portal-central/admin/audit?tenantSlug=${encodeURIComponent(slug)}&limit=50`, { credentials: 'include' })
      const d = await r.json().catch(() => ({}))
      setActivityModal({ slug, name, rows: r.ok ? (d.audit || []) : [] })
    } catch {
      setActivityModal({ slug, name, rows: [] })
    }
  }, [])

  useEffect(() => {
    fetch('/api/portal-central/admin/login', { credentials: 'include' })
      .then((r) => r.json())
      .then(async (j) => {
        if (j.authenticated) {
          setAuthed(true)
          setIdentity(j.identity ?? null)
          await Promise.all([loadMetrics(), loadProfitSplit(), loadErrors(), loadAudit(), loadClients(), loadUsers(), loadPlans(), loadAdmins(), loadSmtp()])
        }
      })
      .catch(() => undefined)
  }, [loadMetrics, loadProfitSplit, loadErrors, loadAudit, loadClients, loadUsers, loadPlans, loadAdmins, loadSmtp])

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
      track('crear-cliente', { slug: data?.tenant?.slug })
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
      const email = loginEmail.trim().toLowerCase()
      const r = await fetch('/api/portal-central/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(email ? { email, password: adminPassword } : { password: adminPassword }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Error')
      setAuthed(true)
      setIdentity(email || 'master')
      setAdminPassword('')
      setLoginEmail('')
      await Promise.all([loadMetrics(), loadProfitSplit(), loadErrors(), loadAudit(), loadClients(), loadUsers(), loadPlans(), loadAdmins(), loadSmtp()])
      track('portal-login')
      setOkMsg('Sesión iniciada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  // ── Handlers de Fases 1-3 ────────────────────────────────────────────────
  const patchClient = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/portal-central/admin/clients', {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || 'Error')
    return data
  }
  const assignPlan = async (clientId: string, planId: string) => {
    setBusy(true)
    try { await patchClient({ id: clientId, planId: planId || null }); await Promise.all([loadClients(), loadMetrics(), loadAudit()]) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') } finally { setBusy(false) }
  }
  const saveClientEdit = async () => {
    if (!editClient) return
    setBusy(true)
    try {
      await patchClient({
        id: editClient.id,
        name: editClient.name,
        priceMonthly: editClient.priceMonthly === '' || editClient.priceMonthly == null ? null : Number(editClient.priceMonthly),
        trialEndsAt: editClient.trialEndsAt || null,
        memberLimit: editClient.memberLimit === '' || editClient.memberLimit == null ? null : Number(editClient.memberLimit),
        notes: editClient.notes || null,
        tags: String(editClient.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
      })
      setOkMsg('Cliente actualizado.'); setEditClient(null)
      await Promise.all([loadClients(), loadMetrics(), loadAudit()])
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') } finally { setBusy(false) }
  }
  const resendAccess = async (clientId: string) => {
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/resend-access', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: clientId }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Error')
      setResendInfo({ email: data.email, tempPassword: data.tempPassword })
      await loadAudit()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') } finally { setBusy(false) }
  }
  const savePlan = async () => {
    if (!planModal) return
    if (!String(planModal.name || '').trim()) { setError('Ponle un nombre al plan.'); return }
    setBusy(true)
    try {
      const payload = {
        name: planModal.name,
        priceMonthly: Number(planModal.priceMonthly) || 0,
        sections: planModal.sections,
        memberLimit: planModal.memberLimit === '' || planModal.memberLimit == null ? null : Number(planModal.memberLimit),
      }
      const r = await fetch('/api/portal-central/admin/plans', {
        method: planModal.id ? 'PATCH' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planModal.id ? { id: planModal.id, ...payload } : payload),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error')
      setOkMsg('Plan guardado.'); setPlanModal(null); await loadPlans()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el plan.') } finally { setBusy(false) }
  }
  const removePlan = async (id: string) => {
    if (!(typeof window !== 'undefined' && window.confirm('¿Eliminar este plan? Los clubes con él quedarán sin plan (conservan precio/módulos ya fijados).'))) return
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/plans', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error')
      await Promise.all([loadPlans(), loadClients()])
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo eliminar el plan.') } finally { setBusy(false) }
  }
  /**
   * El JSON que la tienda espera en `CRM_PLANES`, generado a partir de los
   * planes que ya existen aquí.
   *
   * Se hace así para que el precio y el nombre no haya que teclearlos dos
   * veces: el plan se define en un único sitio —este panel— y la tienda recibe
   * una copia. Escribirlos a mano en las dos puntas es cómo se acaba cobrando
   * un precio distinto del que anuncia el panel.
   *
   * `periodo` va en días (30 = mensual). Solo se incluyen los planes que ya
   * tienen URL de webhook: sin ella la tienda no sabría a dónde avisar.
   */
  const crmPlanesJson = () => {
    const conWebhook = plans.filter((p) => p.webhookToken)
    return JSON.stringify(
      conWebhook.map((p) => ({
        // La clave es la IDENTIDAD del plan para la tienda: viaja en la metadata
        // de cada suscripción y es por la que se busca al renovar o al cancelar.
        // Tiene que ser ESTABLE y ÚNICA, y un texto sacado del nombre no es
        // ninguna de las dos cosas: renombrar «Básico» a «Esencial» la cambiaría
        // y las suscripciones ya vendidas dejarían de encontrar su plan; y «Pro»
        // y «Pro+» caerían las dos en `pro`, con lo que un comprador acabaría en
        // el plan del otro. El identificador interno no cambia nunca. Lo legible
        // va en `nombre`.
        clave: p.id,
        nombre: p.name,
        precio: p.priceMonthly,
        // En DÍAS. El panel solo maneja cuota mensual, así que aquí siempre 30:
        // no crees un plan llamado «anual» hasta que el plan guarde su propia
        // periodicidad, porque se cobraría cada 30 días igualmente.
        periodo: 30,
        webhook: `${webhookBase}/api/portal-central/webhooks/subscription/${p.webhookToken}`,
        ...(p.webhookSecret ? { secreto: p.webhookSecret } : {}),
        ventajas: CRM_SECTIONS.filter((s) => p.sections.includes(s.id)).map((s) => s.label),
      })),
      null,
      2,
    )
  }

  const ensureWebhook = async (id: string) => {
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/plans', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ensureWebhook: true }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error')
      await loadPlans()
      setOkMsg('URL de webhook generada.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo generar el webhook.') } finally { setBusy(false) }
  }
  const regenerateWebhook = async (id: string) => {
    if (!(typeof window !== 'undefined' && window.confirm('¿Regenerar la URL? La anterior dejará de funcionar y tendrás que actualizarla en la tienda.'))) return
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/plans', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, regenerateWebhook: true }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error')
      await loadPlans()
      setOkMsg('URL de webhook regenerada.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo regenerar el webhook.') } finally { setBusy(false) }
  }
  const ensureHmacSecret = async (id: string) => {
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/plans', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ensureWebhookSecret: true }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error')
      await loadPlans()
      setOkMsg('Firma HMAC activada. Configura el secreto en tu tienda.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo activar la firma.') } finally { setBusy(false) }
  }
  const regenerateHmacSecret = async (id: string) => {
    if (!(typeof window !== 'undefined' && window.confirm('¿Regenerar el secreto HMAC? Las firmas hechas con el anterior dejarán de valer y tendrás que actualizarlo en la tienda.'))) return
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/plans', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, regenerateWebhookSecret: true }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error')
      await loadPlans()
      setOkMsg('Secreto HMAC regenerado.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo regenerar el secreto.') } finally { setBusy(false) }
  }
  const testSmtp = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/smtp-test', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: smtpTestTo.trim() }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Error')
      setSmtpConfigured(true)
      setOkMsg(`Correo de prueba enviado a ${smtpTestTo.trim()}. Revisa la bandeja (y spam).`)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar el correo de prueba.') } finally { setBusy(false) }
  }
  const addAdmin = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/admins', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: naEmail.trim(), password: naPassword, name: naName.trim() }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Error')
      setNaEmail(''); setNaPassword(''); setNaName(''); setOkMsg('Super-admin creado.'); await loadAdmins()
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') } finally { setBusy(false) }
  }
  const toggleAdmin = async (id: string, status: string) => {
    setBusy(true)
    try {
      const next = status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
      const r = await fetch('/api/portal-central/admin/admins', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: next }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error')
      await loadAdmins()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar el super-admin.') } finally { setBusy(false) }
  }
  const resetAdminPw = async (id: string) => {
    const pw = typeof window !== 'undefined' ? window.prompt('Nueva contraseña (mín. 8 caracteres):') : null
    if (pw == null) return
    if (pw.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/portal-central/admin/admins', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password: pw }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Error')
      setOkMsg('Contraseña actualizada.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.') } finally { setBusy(false) }
  }
  const logout = async () => {
    try { await fetch('/api/portal-central/admin/logout', { method: 'POST', credentials: 'include' }) } catch {}
    if (typeof window !== 'undefined') window.location.reload()
  }
  const exportAuditCsv = () => {
    const rows = audit || []
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = 'fecha,actor,accion,club,ip\n'
    const bodyCsv = rows.map((a) => [new Date(a.createdAt).toISOString(), a.actor, a.action, a.tenantName || a.tenantSlug || '', a.ip || ''].map(esc).join(',')).join('\n')
    const blob = new Blob([header + bodyCsv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `auditoria-portal-${new Date().toISOString().slice(0, 10)}.csv`; link.click()
    URL.revokeObjectURL(url)
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

  const now = Date.now()
  // La URL pública la manda el SERVIDOR. `window.location.origin` es el host por
  // el que navega el super-admin —localhost, un entorno de pruebas, el dominio
  // de la plataforma aunque ya haya uno propio— y acaba dentro del JSON que se
  // pega en la tienda: cada compra pagada avisaría al sitio equivocado, sin
  // ningún error visible. Solo se usa como último recurso.
  const panelOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const webhookBase = portalPublicUrl || panelOrigin
  const baseDesajustada = Boolean(portalPublicUrl && panelOrigin && portalPublicUrl !== panelOrigin)
  const perClubBySlug: Record<string, { slug: string; name: string; ok: boolean; membersTotal: number; membersActive: number }> = {}
  ;(metrics?.latest?.perClub || []).forEach((c: { slug: string; name: string; ok: boolean; membersTotal: number; membersActive: number }) => { perClubBySlug[c.slug] = c })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: PC.bg, color: PC.text }}>
      {authed ? <PortalSidebar active={view} onSelect={setView} onLogout={logout} identity={identity} /> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: authed ? 1180 : 440, margin: authed ? 0 : '0 auto', padding: authed ? '30px 40px 64px' : '64px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Cabecera per-vista */}
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em', color: PC.text }}>
              {authed
                ? (({ dashboard: 'Dashboard', clubes: 'Clubes', planes: 'Planes', usuarios: 'Usuarios de acceso', actividad: 'Actividad', errores: 'Errores', admins: 'Super-admins' }) as Record<string, string>)[view] || 'Panel'
                : 'Panel admin del portal'}
            </h1>
            <p style={{ margin: '7px 0 0', color: PC.sub, lineHeight: 1.5, fontSize: 14, maxWidth: 640 }}>
              {authed
                ? (({ dashboard: 'KPIs y facturación de toda la red de clubes.', clubes: 'Alta, plan, prueba, acceso y módulos de cada club.', planes: 'Planes comerciales: módulos incluidos, precio y límite de socios.', usuarios: 'Usuarios de acceso al CRM de cada club.', actividad: 'Registro de acciones sensibles del portal.', errores: 'Errores de servidor de cada club, agrupados.', admins: 'Super-admins con acceso a este panel (además de la contraseña maestra).' }) as Record<string, string>)[view] || ''
                : 'Crea clientes (cada uno con su CRM y base de datos aislada) y sus usuarios de acceso. Todos entran por /portal.'}
            </p>
          </div>

          {error ? <Msg kind="error" text={error} onClose={() => setError('')} /> : null}
          {okMsg ? <Msg kind="ok" text={okMsg} onClose={() => setOkMsg('')} /> : null}

          {!authed ? (
            <div style={{ ...aCard, maxWidth: 420 }}>
              <label style={labelStyle}>Email (opcional — vacío = contraseña maestra)</label>
              <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="tú@correo.com" style={darkInput} />
              <label style={labelStyle}>Contraseña</label>
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
              {/* ── DASHBOARD ── */}
              {view === 'dashboard' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
                    <KpiTile label="MRR" value={fmtEur(metrics?.billing?.mrr || 0)} sub="ingresos recurrentes / mes" color={PC.green} icon={kpiIcon(<><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>)} />
                    <KpiTile label="ARR" value={fmtEur(metrics?.billing?.arr || 0)} sub="anualizado" color="#60a5fa" icon={kpiIcon(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>)} />
                    <KpiTile label="En prueba" value={String(metrics?.billing?.trials || 0)} sub="clubes en trial" color={PC.amber} icon={kpiIcon(<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>)} />
                  </div>
                  <ProfitSplitCard mrr={metrics?.billing?.mrr || 0} arr={metrics?.billing?.arr || 0} split={split} onSave={saveProfitSplit} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                    <AprovechamientoCard clients={clients} perClub={perClubBySlug} />
                    <MorosidadCard perClub={perClubBySlug} />
                  </div>
                  <DashboardCard metrics={metrics} />
                </>
              )}

              {/* ── CLUBES ── */}
              {view === 'clubes' && (
                <>
                  <section style={aCard}>
                    {sectionTitle('Crear cliente', 'Crea su base de datos aislada y su administrador. El CRM queda en subdominio.tudominio.')}
                    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 16px' }}>
                      <div><label style={labelStyle}>Nombre del club</label><input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Club Voley Ejemplo" style={darkInput} /></div>
                      <div><label style={labelStyle}>Subdominio (opcional)</label><input value={cSlug} onChange={(e) => setCSlug(e.target.value)} placeholder="club-ejemplo" style={darkInput} /></div>
                      <div><label style={labelStyle}>Email del administrador</label><input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="admin@club.com" style={darkInput} /></div>
                      <div><label style={labelStyle}>Contraseña del administrador</label><input type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="mínimo 8 caracteres" style={darkInput} /></div>
                    </div>
                    <button type="button" disabled={busy || !cName.trim() || !cEmail.trim() || cPassword.length < 8} onClick={() => void crearCliente()} style={{ ...aBtn, marginTop: 4, opacity: busy || !cName.trim() || !cEmail.trim() || cPassword.length < 8 ? 0.5 : 1 }}>{busy ? 'Creando y desplegando…' : 'Crear cliente y desplegar CRM'}</button>
                  </section>

                  <section style={aCard}>
                    {sectionTitle(`Clubes (${clients.length})`)}
                    {clients.length === 0 ? (
                      <p style={{ color: PC.sub, margin: '16px 0 0', fontSize: 14 }}>Aún no hay clubes.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                        {clients.map((c) => {
                          const pc = perClubBySlug[c.slug]
                          const members = pc ? pc.membersTotal : null
                          const trialDays = c.trialEndsAt ? Math.ceil((new Date(c.trialEndsAt).getTime() - now) / 86400000) : null
                          const onTrial = trialDays != null && trialDays > 0
                          return (
                            <div key={c.id} style={{ background: PC.card2, border: `1px solid ${PC.border}`, borderRadius: 14, padding: 16 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 160 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, fontSize: 15, color: PC.text }}>{c.name}</span>
                                    {onTrial ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(245,158,11,.14)', color: PC.amber }}>Prueba · {trialDays}d</span> : null}
                                    {(c.tags || []).map((t: string) => {
                                      const isFlag = t.trim().toLowerCase() === NO_SUSPEND_TAG
                                      return <span key={t} style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: isFlag ? 'rgba(96,165,250,.16)' : 'rgba(255,255,255,.06)', color: isFlag ? '#60a5fa' : PC.sub }}>{t}</span>
                                    })}
                                  </div>
                                  <div style={{ color: PC.muted, fontSize: 12.5, marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>{c.slug} · {c.userCount} usuario{c.userCount === 1 ? '' : 's'}{c.priceMonthly != null ? ` · ${fmtEur(c.priceMonthly)}/mes` : ''}</div>
                                  {c.notes ? <div style={{ color: PC.sub, fontSize: 12, marginTop: 4, fontStyle: 'italic' }} title={c.notes}>📝 {String(c.notes).slice(0, 90)}{String(c.notes).length > 90 ? '…' : ''}</div> : null}
                                </div>
                                {badge(c.status === 'ACTIVE', c.status === 'ACTIVE' ? 'Activo' : 'Suspendido')}
                                <button type="button" disabled={busy} onClick={() => { setImpReason(''); setImpModal({ id: c.id, name: c.name }) }} title="Entrar al CRM como su admin (soporte)" style={aBtnGhost}>Entrar como</button>
                                <button type="button" disabled={busy} onClick={() => void openActivity(c.slug, c.name)} title="Actividad de soporte de este club" style={aBtnGhost}>Actividad</button>
                                <button type="button" disabled={busy} onClick={() => setEditClient({ id: c.id, name: c.name, priceMonthly: c.priceMonthly ?? '', trialEndsAt: c.trialEndsAt ? c.trialEndsAt.slice(0, 10) : '', memberLimit: c.memberLimit ?? '', notes: c.notes ?? '', tags: (c.tags || []).join(', ') })} style={aBtnGhost}>Editar</button>
                                <button type="button" disabled={busy} onClick={() => void resendAccess(c.id)} title="Genera una contraseña temporal para el admin del club" style={aBtnGhost}>Reenviar acceso</button>
                                <button type="button" disabled={busy} onClick={() => void toggleClient(c.id, c.status)} style={{ ...aBtnGhost, borderColor: c.status === 'ACTIVE' ? 'rgba(251,113,133,.5)' : PC.border2, color: c.status === 'ACTIVE' ? PC.danger : PC.text }}>{c.status === 'ACTIVE' ? 'Suspender' : 'Reactivar'}</button>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 11, color: PC.muted, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Plan</span>
                                  <select value={c.planId || ''} onChange={(e) => void assignPlan(c.id, e.target.value)} disabled={busy} style={{ ...darkInput, width: 'auto', marginBottom: 0, padding: '6px 10px', fontSize: 12.5, cursor: 'pointer' }}>
                                    <option value="">Sin plan</option>
                                    {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {fmtEur(p.priceMonthly)}</option>)}
                                  </select>
                                </div>
                                <div style={{ flex: 1, minWidth: 150 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: PC.muted, marginBottom: 4 }}>
                                    <span>Socios{c.memberLimit ? ' / límite' : ''}</span>
                                    <span style={{ color: PC.sub, fontVariantNumeric: 'tabular-nums' }}>{members == null ? '—' : members}{c.memberLimit ? ` / ${c.memberLimit}` : ''}</span>
                                  </div>
                                  {c.memberLimit ? (
                                    <div style={{ height: 6, background: PC.inset, borderRadius: 999, overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${Math.min(100, Math.round(((members || 0) / c.memberLimit) * 100))}%`, background: (members || 0) >= c.memberLimit ? PC.danger : PC.green, borderRadius: 999 }} />
                                    </div>
                                  ) : null}
                                </div>
                                <span style={{ fontSize: 11.5, color: pc ? (pc.ok ? PC.green : PC.danger) : PC.muted, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: pc ? (pc.ok ? PC.green : PC.danger) : PC.muted }} />
                                  {pc ? (pc.ok ? 'OK' : 'Error') : 'sin datos'}
                                </span>
                              </div>

                              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: PC.muted, marginRight: 2, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Secciones</span>
                                {CRM_SECTIONS.map((m) => {
                                  // Por SECCIÓN y no por módulo: el plan apaga secciones sueltas, y
                                  // un interruptor de módulo no podría volver a encender una de ellas.
                                  const on = c.features?.[m.id] !== false
                                  return (
                                    <button key={m.id} type="button" disabled={busy} onClick={() => void toggleClientModule(c.id, m.id, c.features)} title={on ? `Desactivar ${m.label}` : `Activar ${m.label}`}
                                      style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', font: 'inherit', background: on ? PC.greenBg : 'transparent', border: `1px solid ${on ? 'rgba(16,185,129,.5)' : PC.border2}`, color: on ? PC.green : PC.muted }}>
                                      {on ? '✓ ' : '✕ '}{m.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>
                </>
              )}

              {/* ── PLANES ── */}
              {view === 'planes' && (
                <section style={aCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    {sectionTitle(`Planes (${plans.length})`, 'Módulos incluidos, precio y límite de socios. Asignar un plan a un club fija sus módulos.')}
                    <button type="button" onClick={() => setPlanModal({ name: '', priceMonthly: '', sections: [], memberLimit: '' })} style={aBtn}>＋ Nuevo plan</button>
                  </div>

                  {/* Estado del correo (SMTP) — necesario para el email de bienvenida de las altas por webhook */}
                  <div style={{ background: PC.card2, border: `1px solid ${PC.border}`, borderRadius: 14, padding: 16, margin: '16px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: PC.text }}>
                        Correo{mailTransporte ? ` (${mailTransporte === 'resend' ? 'Resend' : 'SMTP'})` : ''}
                      </span>
                      {smtpConfigured === null
                        ? null
                        : badge(smtpConfigured, smtpConfigured ? 'Configurado' : 'Sin configurar')}
                      <span style={{ flex: 1 }} />
                      <input type="email" value={smtpTestTo} onChange={(e) => setSmtpTestTo(e.target.value)} placeholder="tú@correo.com" style={{ ...darkInput, marginBottom: 0, width: 'auto', minWidth: 200, fontSize: 13 }} />
                      <button type="button" disabled={busy || !smtpTestTo.trim()} onClick={() => void testSmtp()} style={{ ...aBtnGhost, opacity: busy || !smtpTestTo.trim() ? 0.5 : 1 }}>Enviar prueba</button>
                    </div>
                    <div style={{ fontSize: 11.5, color: PC.muted, marginTop: 8, lineHeight: 1.45 }}>
                      Define en el servicio <strong style={{ color: PC.sub }}>portal</strong> (Railway) las variables <span style={{ fontFamily: 'ui-monospace, monospace' }}>RESEND_API_KEY</span> y <span style={{ fontFamily: 'ui-monospace, monospace' }}>RESEND_FROM</span> (el remitente tiene que ser de un dominio verificado en Resend), y envíate una prueba antes de recibir clientes reales. Sin esto el club se crea, pero el comprador nunca recibe su contraseña. Se admite también SMTP como respaldo (<span style={{ fontFamily: 'ui-monospace, monospace' }}>SMTP_HOST, SMTP_FROM</span>…), que solo se usa si no hay clave de Resend.
                    </div>
                  </div>

                  {plans.length === 0 ? (
                    <p style={{ color: PC.sub, margin: '16px 0 0', fontSize: 14 }}>Aún no hay planes. Crea el primero.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                      {plans.map((p) => (
                        <div key={p.id} style={{ background: PC.card2, border: `1px solid ${PC.border}`, borderRadius: 14, padding: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 160 }}>
                              <div style={{ fontWeight: 700, fontSize: 15, color: PC.text }}>{p.name} <span style={{ color: PC.green, marginLeft: 4 }}>{fmtEur(p.priceMonthly)}/mes</span></div>
                              <div style={{ color: PC.muted, fontSize: 12.5, marginTop: 2 }}>{p.memberLimit ? `Hasta ${p.memberLimit} socios` : 'Socios ilimitados'} · {p.tenantCount} club{p.tenantCount === 1 ? '' : 'es'}</div>
                            </div>
                            <button type="button" onClick={() => setPlanModal({ id: p.id, name: p.name, priceMonthly: String(p.priceMonthly), sections: [...p.sections], memberLimit: p.memberLimit ?? '' })} style={aBtnGhost}>Editar</button>
                            <button type="button" disabled={busy} onClick={() => void removePlan(p.id)} style={{ ...aBtnGhost, borderColor: 'rgba(251,113,133,.5)', color: PC.danger }}>Eliminar</button>
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                            {CRM_SECTIONS.map((m) => {
                              const inc = p.sections.includes(m.id)
                              return <span key={m.id} style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: inc ? PC.greenBg : 'transparent', border: `1px solid ${inc ? 'rgba(16,185,129,.5)' : PC.border2}`, color: inc ? PC.green : PC.muted }}>{inc ? '✓ ' : '· '}{m.label}</span>
                            })}
                          </div>

                          {/* Webhook de alta automática desde una tienda externa */}
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${PC.border}` }}>
                            <div style={{ fontSize: 11, color: PC.muted, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 6 }}>Webhook de alta automática (tienda externa)</div>
                            {p.webhookToken ? (
                              <>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <input readOnly value={`${webhookBase}/api/portal-central/webhooks/subscription/${p.webhookToken}`} onFocus={(e) => e.currentTarget.select()} style={{ ...darkInput, marginBottom: 0, flex: 1, minWidth: 240, fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }} />
                                  <button type="button" onClick={() => { navigator.clipboard?.writeText(`${webhookBase}/api/portal-central/webhooks/subscription/${p.webhookToken}`).then(() => setOkMsg('URL de webhook copiada.')).catch(() => {}) }} style={aBtnGhost}>Copiar</button>
                                  <button type="button" disabled={busy} onClick={() => void regenerateWebhook(p.id)} title="Genera una URL nueva e invalida la anterior" style={{ ...aBtnGhost, borderColor: 'rgba(251,113,133,.5)', color: PC.danger }}>Regenerar</button>
                                </div>
                                <div style={{ fontSize: 11.5, color: PC.muted, marginTop: 6, lineHeight: 1.45 }}>Configura esta URL en tu tienda para este plan. El JSON debe llevar al menos <span style={{ fontFamily: 'ui-monospace, monospace' }}>email</span> (opcional <span style={{ fontFamily: 'ui-monospace, monospace' }}>clubName</span>) y un campo <span style={{ fontFamily: 'ui-monospace, monospace' }}>type</span> con el tipo de evento:</div>
                                <ul style={{ fontSize: 11.5, color: PC.sub, margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
                                  <li><b>alta</b> (<span style={{ fontFamily: 'ui-monospace, monospace' }}>created</span> / sin tipo): crea el club en «{p.name}» + email con la contraseña.</li>
                                  <li><b>cambio de plan</b> (<span style={{ fontFamily: 'ui-monospace, monospace' }}>updated</span>): reasigna el club de ese email a «{p.name}» (envíalo a la URL del plan nuevo).</li>
                                  <li><b>cancelación</b> (<span style={{ fontFamily: 'ui-monospace, monospace' }}>canceled</span>): suspende el club (conserva sus datos).</li>
                                  <li><b>pago fallido</b> (<span style={{ fontFamily: 'ui-monospace, monospace' }}>payment_failed</span>): marca el club con la etiqueta <span style={{ fontFamily: 'ui-monospace, monospace' }}>impago</span>. <b>pago ok</b> (<span style={{ fontFamily: 'ui-monospace, monospace' }}>payment_succeeded</span>): la quita y reactiva.</li>
                                </ul>
                                {p.webhookSecret ? (
                                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${PC.border}` }}>
                                    <div style={{ fontSize: 11, color: PC.green, fontWeight: 700, marginBottom: 6 }}>🔒 Firma HMAC activa — se rechaza todo evento sin firma válida</div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                      <input readOnly value={p.webhookSecret} onFocus={(e) => e.currentTarget.select()} style={{ ...darkInput, marginBottom: 0, flex: 1, minWidth: 240, fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }} />
                                      <button type="button" onClick={() => { navigator.clipboard?.writeText(p.webhookSecret).then(() => setOkMsg('Secreto HMAC copiado.')).catch(() => {}) }} style={aBtnGhost}>Copiar</button>
                                      <button type="button" disabled={busy} onClick={() => void regenerateHmacSecret(p.id)} title="Genera un secreto nuevo e invalida las firmas anteriores" style={{ ...aBtnGhost, borderColor: 'rgba(251,113,133,.5)', color: PC.danger }}>Regenerar</button>
                                    </div>
                                    <div style={{ fontSize: 11.5, color: PC.muted, marginTop: 6, lineHeight: 1.45 }}>Tu tienda debe firmar el cuerpo con este secreto y enviar <span style={{ fontFamily: 'ui-monospace, monospace' }}>HMAC-SHA256(cuerpo)</span> en hex en la cabecera <span style={{ fontFamily: 'ui-monospace, monospace' }}>X-Webhook-Signature</span> (admite prefijo <span style={{ fontFamily: 'ui-monospace, monospace' }}>sha256=</span>).</div>
                                  </div>
                                ) : (
                                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${PC.border}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button type="button" disabled={busy} onClick={() => void ensureHmacSecret(p.id)} style={aBtnGhost}>🔒 Activar firma HMAC</button>
                                    <span style={{ fontSize: 11.5, color: PC.muted }}>Recomendado: exige que la tienda firme cada evento. Sin ella, el token de la URL es la única credencial.</span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <button type="button" disabled={busy} onClick={() => void ensureWebhook(p.id)} style={aBtn}>Generar URL de webhook</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {plans.some((p) => p.webhookToken) && (
                    <div style={{ marginTop: 18, padding: 14, border: `1px solid ${PC.border}`, borderRadius: 10 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Configuración para la tienda</div>
                      <div style={{ fontSize: 12, color: PC.muted, marginBottom: 10, lineHeight: 1.5 }}>
                        Pega esto en la variable <code>CRM_PLANES</code> de la tienda. Sale de los planes
                        de arriba, así que el precio y el nombre se definen en un solo sitio. Vuelve a
                        copiarlo cada vez que cambies un plan, un precio o los módulos incluidos.
                        Todo lo que salga de aquí se cobra <strong>cada 30 días</strong>: el panel
                        solo maneja cuota mensual.
                        {plans.some((p) => p.webhookToken && !p.webhookSecret) && (
                          <> Los planes sin secreto HMAC viajan sin firmar: genéralo antes de vender.</>
                        )}
                      </div>
                      {!portalPublicUrl && (
                        <div style={{ fontSize: 12, color: PC.danger, marginBottom: 10, lineHeight: 1.5 }}>
                          El servidor no sabe cuál es la URL pública del portal, así que las direcciones
                          de webhook llevan el host por el que has entrado tú. No pegues esto sin revisarlas.
                        </div>
                      )}
                      {baseDesajustada && (
                        <div style={{ fontSize: 12, color: PC.amber, marginBottom: 10, lineHeight: 1.5 }}>
                          Estás viendo el panel en <code>{panelOrigin}</code>, pero la dirección pública del
                          portal es <code>{portalPublicUrl}</code>. Se usa la pública: es la que tiene que
                          llamar la tienda.
                        </div>
                      )}
                      {plans.some((p) => !p.webhookToken) && (
                        <div style={{ fontSize: 12, color: PC.amber, marginBottom: 10, lineHeight: 1.5 }}>
                          Quedan fuera por no tener URL de webhook:{' '}
                          {plans.filter((p) => !p.webhookToken).map((p) => p.name).join(', ')}. Si quieres
                          venderlos, pulsa «Generar URL de webhook» en cada uno y vuelve a copiar.
                        </div>
                      )}
                      <textarea
                        readOnly
                        value={crmPlanesJson()}
                        onFocus={(e) => e.currentTarget.select()}
                        rows={8}
                        style={{ ...darkInput, marginBottom: 10, width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 11.5, resize: 'vertical' }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard
                            ?.writeText(crmPlanesJson())
                            .then(() => setOkMsg('CRM_PLANES copiado. Pégalo en la tienda.'))
                            .catch(() => {})
                        }}
                        style={aBtn}
                      >
                        Copiar CRM_PLANES
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* ── USUARIOS ── */}
              {view === 'usuarios' && (
                <section style={aCard}>
                  {sectionTitle(`Usuarios de acceso (${users.length})`)}
                  {clients.length > 0 && (
                    <div style={{ background: PC.card2, border: `1px solid ${PC.border}`, borderRadius: 14, padding: 16, margin: '16px 0' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: PC.text }}>Añadir usuario a un cliente</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 16px' }}>
                        <div><label style={labelStyle}>Club</label>
                          <select value={uTenant} onChange={(e) => setUTenant(e.target.value)} style={darkInput}>
                            <option value="">— Elige cliente —</option>
                            {clients.map((c) => <option key={c.id} value={c.slug}>{c.name} ({c.slug})</option>)}
                          </select>
                        </div>
                        <div><label style={labelStyle}>Rol</label>
                          <select value={uRole} onChange={(e) => setURole(e.target.value)} style={darkInput}>
                            <option value="ADMIN">Administrador</option>
                            <option value="COACH">Entrenador</option>
                            <option value="TREASURER">Tesorero</option>
                            <option value="MEMBER">Socio</option>
                          </select>
                        </div>
                        <div><label style={labelStyle}>Email</label><input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} placeholder="email@usuario.com" style={darkInput} /></div>
                        <div><label style={labelStyle}>Contraseña</label><input type="password" value={uPassword} onChange={(e) => setUPassword(e.target.value)} placeholder="mín. 8 caracteres" style={darkInput} /></div>
                      </div>
                      <button type="button" disabled={busy || !uTenant || !uEmail.trim() || uPassword.length < 8} onClick={() => void addUser()} style={{ ...aBtn, opacity: busy || !uTenant || !uEmail.trim() || uPassword.length < 8 ? 0.5 : 1 }}>Crear usuario</button>
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
                          <button type="button" disabled={busy} onClick={() => void toggleUser(u.id, u.status)} style={{ ...aBtnGhost, borderColor: u.status === 'ACTIVE' ? 'rgba(251,113,133,.5)' : PC.border2, color: u.status === 'ACTIVE' ? PC.danger : PC.text }}>{u.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── ACTIVIDAD ── */}
              {view === 'actividad' && (
                <>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={auditAction} onChange={(e) => { setAuditAction(e.target.value); void loadAudit(e.target.value) }} style={{ ...darkInput, width: 'auto', marginBottom: 0, fontSize: 13, cursor: 'pointer' }}>
                      <option value="">Todas las acciones</option>
                      {Object.keys(AUDIT_LABEL).map((k) => <option key={k} value={k}>{AUDIT_LABEL[k]}</option>)}
                    </select>
                    <button type="button" onClick={exportAuditCsv} style={aBtnGhost}>Exportar CSV</button>
                  </div>
                  <AuditCard rows={audit} />
                </>
              )}

              {/* ── ERRORES ── */}
              {view === 'errores' && <ErrorsCard data={errors} onResolve={resolveError} />}

              {/* ── SUPER-ADMINS ── */}
              {view === 'admins' && (
                <section style={aCard}>
                  {sectionTitle('Super-admins', 'Además de la contraseña maestra (PORTAL_ADMIN_PASSWORD), estos usuarios entran con su email.')}
                  <div style={{ background: PC.card2, border: `1px solid ${PC.border}`, borderRadius: 14, padding: 16, margin: '16px 0' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: PC.text }}>Nuevo super-admin</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 16px' }}>
                      <div><label style={labelStyle}>Email</label><input type="email" value={naEmail} onChange={(e) => setNaEmail(e.target.value)} placeholder="admin@correo.com" style={darkInput} /></div>
                      <div><label style={labelStyle}>Nombre (opcional)</label><input value={naName} onChange={(e) => setNaName(e.target.value)} placeholder="Nombre" style={darkInput} /></div>
                      <div><label style={labelStyle}>Contraseña</label><input type="password" value={naPassword} onChange={(e) => setNaPassword(e.target.value)} placeholder="mín. 8 caracteres" style={darkInput} /></div>
                    </div>
                    <button type="button" disabled={busy || !naEmail.trim() || naPassword.length < 8} onClick={() => void addAdmin()} style={{ ...aBtn, opacity: busy || !naEmail.trim() || naPassword.length < 8 ? 0.5 : 1 }}>Crear super-admin</button>
                  </div>
                  {admins.length === 0 ? (
                    <p style={{ color: PC.sub, margin: 0, fontSize: 14 }}>Aún no hay super-admins con login propio.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {admins.map((a) => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${PC.border}`, padding: '12px 0', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <strong style={{ color: PC.text, fontSize: 14, wordBreak: 'break-all' }}>{a.email}</strong>
                            <div style={{ color: PC.muted, fontSize: 12.5, marginTop: 2 }}>{a.name || '—'}{a.lastLoginAt ? ` · último acceso ${timeAgo(a.lastLoginAt)}` : ' · sin accesos'}</div>
                          </div>
                          {badge(a.status === 'ACTIVE', a.status === 'ACTIVE' ? 'Activo' : 'Desactivado')}
                          <button type="button" disabled={busy} onClick={() => void resetAdminPw(a.id)} style={aBtnGhost}>Contraseña</button>
                          <button type="button" disabled={busy} onClick={() => void toggleAdmin(a.id, a.status)} style={{ ...aBtnGhost, borderColor: a.status === 'ACTIVE' ? 'rgba(251,113,133,.5)' : PC.border2, color: a.status === 'ACTIVE' ? PC.danger : PC.text }}>{a.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}</button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── MODALES ── */}
              {editClient ? (
                <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditClient(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
                  <div style={{ ...aCard, width: '100%', maxWidth: 460 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, color: PC.text }}>Editar cliente</h3>
                    <label style={labelStyle}>Nombre del club</label>
                    <input value={editClient.name} onChange={(e) => setEditClient({ ...editClient, name: e.target.value })} style={darkInput} />
                    <label style={labelStyle}>Precio mensual (€) — vacío = sin precio</label>
                    <input type="number" min={0} value={editClient.priceMonthly} onChange={(e) => setEditClient({ ...editClient, priceMonthly: e.target.value })} placeholder="0" style={darkInput} />
                    <label style={labelStyle}>Fin de prueba (vacío = sin prueba)</label>
                    <input type="date" value={editClient.trialEndsAt} onChange={(e) => setEditClient({ ...editClient, trialEndsAt: e.target.value })} style={darkInput} />
                    <label style={labelStyle}>Límite de socios (vacío = ilimitado)</label>
                    <input type="number" min={0} value={editClient.memberLimit} onChange={(e) => setEditClient({ ...editClient, memberLimit: e.target.value })} placeholder="sin límite" style={darkInput} />
                    <label style={labelStyle}>Etiquetas (separadas por comas — «no-suspender» evita la suspensión por prueba caducada)</label>
                    <input value={editClient.tags} onChange={(e) => setEditClient({ ...editClient, tags: e.target.value })} placeholder="VIP, migración, no-suspender" style={darkInput} />
                    <label style={labelStyle}>Notas internas de soporte</label>
                    <textarea value={editClient.notes} onChange={(e) => setEditClient({ ...editClient, notes: e.target.value })} placeholder="Contexto del club, acuerdos, incidencias…" rows={3} style={{ ...darkInput, resize: 'vertical', fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                      <button type="button" onClick={() => setEditClient(null)} style={aBtnGhost}>Cancelar</button>
                      <button type="button" disabled={busy} onClick={() => void saveClientEdit()} style={{ ...aBtn, opacity: busy ? 0.6 : 1 }}>Guardar</button>
                    </div>
                  </div>
                </div>
              ) : null}

              {impModal ? (
                <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setImpModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
                  <div style={{ ...aCard, width: '100%', maxWidth: 440 }}>
                    <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: PC.text }}>Entrar como «{impModal.name}»</h3>
                    <p style={{ margin: '0 0 14px', fontSize: 13, color: PC.sub }}>Accederás al CRM de este club como su administrador. Indica el motivo; queda registrado en la auditoría.</p>
                    <label style={labelStyle}>Motivo del acceso</label>
                    <input value={impReason} onChange={(e) => setImpReason(e.target.value)} placeholder="p. ej. resolver incidencia de facturación" style={darkInput} autoFocus />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                      <button type="button" onClick={() => setImpModal(null)} style={aBtnGhost}>Cancelar</button>
                      <button type="button" disabled={busy || impReason.trim().length < 3} onClick={async () => { const m = impModal; const reason = impReason.trim(); setImpModal(null); await impersonateClient(m.id, reason) }} style={{ ...aBtn, opacity: busy || impReason.trim().length < 3 ? 0.5 : 1 }}>Entrar</button>
                    </div>
                  </div>
                </div>
              ) : null}

              {activityModal ? (
                <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setActivityModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
                  <div style={{ ...aCard, width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 700, color: PC.text }}>Actividad · {activityModal.name}</h3>
                    <p style={{ margin: '0 0 14px', fontSize: 12.5, color: PC.muted, fontFamily: 'ui-monospace, monospace' }}>{activityModal.slug}</p>
                    <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {activityModal.rows == null ? (
                        <p style={{ color: PC.sub, fontSize: 14, margin: 0 }}>Cargando…</p>
                      ) : activityModal.rows.length === 0 ? (
                        <p style={{ color: PC.sub, fontSize: 14, margin: 0 }}>Sin actividad registrada para este club.</p>
                      ) : activityModal.rows.map((a: { id: string; action: string; actor: string; createdAt: string; detail?: { reason?: string } }) => (
                        <div key={a.id} style={{ border: `1px solid ${PC.border}`, borderRadius: 12, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600, color: PC.text }}>{AUDIT_LABEL[a.action] || a.action}</span>
                            <span style={{ fontSize: 12, color: PC.muted }}>{timeAgo(a.createdAt)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: PC.sub, marginTop: 2 }}>{a.actor}{a.detail && a.detail.reason ? ` · «${a.detail.reason}»` : ''}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                      <button type="button" onClick={() => setActivityModal(null)} style={aBtnGhost}>Cerrar</button>
                    </div>
                  </div>
                </div>
              ) : null}

              {planModal ? (
                <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setPlanModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100, overflowY: 'auto' }}>
                  <div style={{ ...aCard, width: '100%', maxWidth: 480 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, color: PC.text }}>{planModal.id ? 'Editar plan' : 'Nuevo plan'}</h3>
                    <label style={labelStyle}>Nombre</label>
                    <input value={planModal.name} onChange={(e) => setPlanModal({ ...planModal, name: e.target.value })} placeholder="Ej. Pro" style={darkInput} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                      <div><label style={labelStyle}>Precio mensual (€)</label><input type="number" min={0} value={planModal.priceMonthly} onChange={(e) => setPlanModal({ ...planModal, priceMonthly: e.target.value })} placeholder="0" style={darkInput} /></div>
                      <div><label style={labelStyle}>Límite de socios</label><input type="number" min={0} value={planModal.memberLimit} onChange={(e) => setPlanModal({ ...planModal, memberLimit: e.target.value })} placeholder="ilimitado" style={darkInput} /></div>
                    </div>
                    <label style={labelStyle}>Qué incluye el plan</label>
                    {/* Agrupado como la tabla comercial: se decide sección a sección,
                        que es como se venden los planes de verdad. */}
                    {[...new Set(CRM_SECTIONS.map((s) => s.grupo))].map((grupo) => (
                      <div key={grupo} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: PC.muted, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 5 }}>{grupo}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {CRM_SECTIONS.filter((s) => s.grupo === grupo).map((m) => {
                            const inc = planModal.sections.includes(m.id)
                            return (
                              <button key={m.id} type="button" onClick={() => setPlanModal({ ...planModal, sections: inc ? planModal.sections.filter((x: string) => x !== m.id) : [...planModal.sections, m.id] })}
                                style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', font: 'inherit', background: inc ? PC.greenBg : 'transparent', border: `1px solid ${inc ? 'rgba(16,185,129,.5)' : PC.border2}`, color: inc ? PC.green : PC.muted }}>
                                {inc ? '✓ ' : '＋ '}{m.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                      <button type="button" onClick={() => setPlanModal(null)} style={aBtnGhost}>Cancelar</button>
                      <button type="button" disabled={busy} onClick={() => void savePlan()} style={{ ...aBtn, opacity: busy ? 0.6 : 1 }}>Guardar plan</button>
                    </div>
                  </div>
                </div>
              ) : null}

              {resendInfo ? (
                <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setResendInfo(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
                  <div style={{ ...aCard, width: '100%', maxWidth: 440 }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: PC.text }}>Acceso regenerado</h3>
                    <p style={{ margin: '0 0 14px', color: PC.sub, fontSize: 13, lineHeight: 1.5 }}>Comunica esta contraseña temporal al admin del club. Se muestra una sola vez; entra por <strong style={{ color: PC.text }}>/portal</strong>.</p>
                    <div style={{ background: PC.inset, border: `1px solid ${PC.border}`, borderRadius: 10, padding: 14, fontFamily: 'ui-monospace, monospace' }}>
                      <div style={{ fontSize: 12.5, color: PC.sub }}>{resendInfo.email}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: PC.text, marginTop: 4, wordBreak: 'break-all' }}>{resendInfo.tempPassword}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                      <button type="button" onClick={() => { navigator.clipboard?.writeText(resendInfo.tempPassword).catch(() => {}) }} style={aBtnGhost}>Copiar</button>
                      <button type="button" onClick={() => setResendInfo(null)} style={aBtn}>Hecho</button>
                    </div>
                  </div>
                </div>
              ) : null}
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
  UPDATE_CLIENT: 'Editó el club',
  UPDATE_FEATURES: 'Cambió los módulos',
  ASSIGN_PLAN: 'Asignó un plan',
  CREATE_USER: 'Creó un usuario',
  DISABLE_USER: 'Desactivó un usuario',
  ENABLE_USER: 'Activó un usuario',
  RESET_PASSWORD: 'Reseteó una contraseña',
  CREATE_PLAN: 'Creó un plan',
  UPDATE_PLAN: 'Editó un plan',
  DELETE_PLAN: 'Eliminó un plan',
  UPDATE_PROFIT_SPLIT: 'Cambió el reparto de beneficios',
  CREATE_ADMIN: 'Creó un super-admin',
  ENABLE_ADMIN: 'Activó un super-admin',
  DISABLE_ADMIN: 'Desactivó un super-admin',
  RESET_ADMIN_PASSWORD: 'Reseteó contraseña de super-admin',
  AUTO_SUSPEND_TRIAL: 'Suspensión automática (prueba caducada)',
  WEBHOOK_SUBSCRIPTION: 'Alta automática por webhook (tienda)',
  WEBHOOK_SUBSCRIPTION_DUP: 'Webhook: email ya existente (sin duplicar)',
  WEBHOOK_PLAN_CHANGE: 'Webhook: cambio de plan (tienda)',
  WEBHOOK_CANCEL: 'Webhook: cancelación → suspendido (tienda)',
  WEBHOOK_PAYMENT_FAILED: 'Webhook: pago fallido → impago (tienda)',
  WEBHOOK_PAYMENT_OK: 'Webhook: pago recuperado (tienda)',
  ENSURE_PLAN_WEBHOOK: 'Generó URL de webhook de un plan',
  REGEN_PLAN_WEBHOOK: 'Regeneró URL de webhook de un plan',
  ENSURE_PLAN_WEBHOOK_SECRET: 'Activó la firma HMAC de un webhook',
  REGEN_PLAN_WEBHOOK_SECRET: 'Regeneró el secreto HMAC de un webhook',
}
const AUDIT_COLOR: Record<string, string> = {
  SUSPEND: '#fb7185',
  REACTIVATE: '#10b981',
  IMPERSONATE: '#f59e0b',
  CREATE_CLIENT: '#e11d48',
  UPDATE_CLIENT: '#60a5fa',
  ASSIGN_PLAN: '#60a5fa',
  CREATE_PLAN: '#10b981',
  DELETE_PLAN: '#fb7185',
  CREATE_ADMIN: '#e11d48',
  DISABLE_ADMIN: '#fb7185',
  ENABLE_ADMIN: '#10b981',
  RESET_ADMIN_PASSWORD: '#f59e0b',
  AUTO_SUSPEND_TRIAL: '#fb7185',
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
  // Total real de no-resueltos (prisma.count sobre toda la tabla). Las filas
  // mostradas se limitan a 100, así que NO contamos sobre `errors` (sería tope 100).
  const unresolvedTotal = data.summary?.unresolved ?? errors.filter((e) => !e.resolved).length
  const levelColor = (lvl: string) => (lvl === 'FATAL' ? '#f87171' : lvl === 'WARN' ? '#fbbf24' : '#fb7185')

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: PC.text }}>Errores recientes</h2>
        <span style={{ fontSize: 12, fontWeight: 600, color: unresolvedTotal ? PC.danger : PC.green }}>
          {unresolvedTotal
            ? `${unresolvedTotal} sin resolver · ${data.summary.clubsAffected} club(es)`
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
function fmtEur2(n: number) {
  return `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`
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

/** Reparto de beneficios sobre el MRR: dos partes (por defecto 60% "Tú" / 40% "ProClub"),
 *  porcentaje y etiquetas editables. Los importes se derivan del MRR en vivo del dashboard. */
function ProfitSplitCard({ mrr, arr, split, onSave }: {
  mrr: number
  arr: number
  split: { selfPct: number; otherPct: number; selfLabel: string; otherLabel: string } | null
  onSave: (patch: { selfPct?: number; selfLabel?: string; otherLabel?: string }) => Promise<boolean>
}) {
  const selfPct = split ? split.selfPct : 60
  const otherPct = split ? split.otherPct : 40
  const selfLabel = split ? split.selfLabel : 'Tú'
  const otherLabel = split ? split.otherLabel : 'ProClub'
  const selfMonthly = (mrr * selfPct) / 100
  const otherMonthly = mrr - selfMonthly

  const [editing, setEditing] = useState(false)
  const [pct, setPct] = useState<number | string>(selfPct)
  const [sLabel, setSLabel] = useState(selfLabel)
  const [oLabel, setOLabel] = useState(otherLabel)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // No pisar lo que el admin está tecleando: solo re-sincroniza fuera de edición.
    if (split && !editing) { setPct(split.selfPct); setSLabel(split.selfLabel); setOLabel(split.otherLabel) }
  }, [split, editing])

  const BLUE = '#60a5fa'
  const card: React.CSSProperties = { background: PC.card, border: `1px solid ${PC.border}`, borderRadius: 20, padding: 24 }
  const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${PC.border}`, borderRadius: 10, color: PC.text, padding: '9px 11px', fontSize: 14, width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11.5, color: PC.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 6 }
  const previewSelf = Math.min(100, Math.max(0, Number(pct || 0)))

  async function handleSave() {
    setSaving(true)
    // Clampa en cliente (coherente con la barra/preview) para no provocar un 400
    // si se teclea >100: se ajusta a 0-100 en vez de rechazar.
    const clamped = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)))
    const ok = await onSave({ selfPct: clamped, selfLabel: sLabel, otherLabel: oLabel })
    setSaving(false)
    if (ok) setEditing(false)
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: PC.text }}>Reparto de beneficios</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: PC.sub }}>
            Sobre el MRR · <strong style={{ color: PC.text }}>{fmtEur2(mrr)}</strong>/mes · {fmtEur2(arr)}/año
            <span style={{ color: PC.muted }}> (ingresos recurrentes, sin pruebas)</span>
          </p>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} style={{ background: 'transparent', border: `1px solid ${PC.border}`, color: PC.text, borderRadius: 10, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Editar reparto</button>
        )}
      </div>

      <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', marginTop: 18, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ width: `${selfPct}%`, background: PC.green }} />
        <div style={{ width: `${otherPct}%`, background: BLUE }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 18 }}>
        <SplitRow color={PC.green} label={selfLabel} pct={selfPct} monthly={selfMonthly} />
        <SplitRow color={BLUE} label={otherLabel} pct={otherPct} monthly={otherMonthly} />
      </div>

      {editing && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${PC.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
            <div>
              <label style={lbl}>% para {sLabel || 'ti'}</label>
              <input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Etiqueta tuya</label>
              <input value={sLabel} onChange={(e) => setSLabel(e.target.value)} maxLength={40} style={inp} />
            </div>
            <div>
              <label style={lbl}>Etiqueta ProClub</label>
              <input value={oLabel} onChange={(e) => setOLabel(e.target.value)} maxLength={40} style={inp} />
            </div>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 13, color: PC.sub }}>
            {sLabel || 'Tú'} <strong style={{ color: PC.text }}>{previewSelf}%</strong> · {oLabel || 'ProClub'} <strong style={{ color: PC.text }}>{100 - previewSelf}%</strong>
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" disabled={saving} onClick={() => void handleSave()} style={{ background: PC.green, color: '#04140c', border: 'none', borderRadius: 10, padding: '9px 18px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Guardando…' : 'Guardar reparto'}</button>
            <button type="button" disabled={saving} onClick={() => { setEditing(false); if (split) { setPct(split.selfPct); setSLabel(split.selfLabel); setOLabel(split.otherLabel) } }} style={{ background: 'transparent', border: `1px solid ${PC.border}`, color: PC.sub, borderRadius: 10, padding: '9px 18px', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  )
}

function SplitRow({ color, label, pct, monthly }: { color: string; label: string; pct: number; monthly: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${PC.border}`, borderRadius: 14, padding: '14px 16px' }}>
      <span style={{ width: 10, height: 10, borderRadius: 999, background: color, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: PC.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color, flexShrink: 0 }}>{pct}%</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: PC.text, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{fmtEur2(monthly)}<span style={{ fontSize: 12.5, color: PC.sub, fontWeight: 500 }}> /mes</span></div>
        <div style={{ fontSize: 12, color: PC.sub, marginTop: 1 }}>{fmtEur2(monthly * 12)} /año</div>
      </div>
    </div>
  )
}

/** QW: aprovechamiento del plan — socios activos vs memberLimit por club (del snapshot). */
function AprovechamientoCard({ clients, perClub }: { clients: any[]; perClub: Record<string, any> }) {
  const card: React.CSSProperties = { background: PC.card, border: `1px solid ${PC.border}`, borderRadius: 20, padding: 22 }
  const rows = (clients || [])
    .filter((c) => c.status === 'ACTIVE' && c.memberLimit != null && c.memberLimit > 0)
    .map((c) => {
      const pc = perClub[c.slug]
      // membersTotal (no membersActive): coherente con la barra por-club y con el
      // "Hasta X socios" del plan, que también miran el total de socios.
      const members = pc ? (pc.membersTotal ?? 0) : null
      return { name: c.name, slug: c.slug, limit: c.memberLimit, members, ratio: members != null ? members / c.memberLimit : 0 }
    })
    .filter((r) => r.members != null)
  const over = rows.filter((r) => r.members > r.limit).sort((a, b) => (b.members - b.limit) - (a.members - a.limit))
  const under = rows.filter((r) => r.members <= r.limit && r.limit >= 4 && r.ratio < 0.3).sort((a, b) => a.ratio - b.ratio)

  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: PC.text }}>Aprovechamiento de planes</h2>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: PC.sub }}>Socios totales frente al límite del plan de cada club.</p>
      {rows.length === 0 ? (
        <p style={{ margin: '16px 0 0', fontSize: 13.5, color: PC.muted }}>Ningún club activo tiene límite de plan configurado (o aún no hay snapshot).</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em', color: PC.danger, fontWeight: 700, marginBottom: 8 }}>Por encima del límite · subir de plan ({over.length})</div>
            {over.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: PC.muted }}>Ninguno.</p> : over.slice(0, 5).map((r) => <UsageRow key={r.slug} name={r.name} members={r.members} limit={r.limit} color={PC.danger} />)}
          </div>
          <div>
            <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em', color: PC.amber, fontWeight: 700, marginBottom: 8 }}>Infrautilizados · menos del 30% ({under.length})</div>
            {under.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: PC.muted }}>Ninguno.</p> : under.slice(0, 5).map((r) => <UsageRow key={r.slug} name={r.name} members={r.members} limit={r.limit} color={PC.amber} />)}
          </div>
        </div>
      )}
    </section>
  )
}

function UsageRow({ name, members, limit, color }: { name: string; members: number; limit: number; color: string }) {
  const pct = Math.min(100, Math.round((members / limit) * 100))
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
        <span style={{ color: PC.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ color, fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{members}/{limit}</span>
      </div>
      <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,.07)', marginTop: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color }} />
      </div>
    </div>
  )
}

/** QW: ranking de morosidad por club (socios morosos y deuda pendiente, del snapshot). */
function MorosidadCard({ perClub }: { perClub: Record<string, any> }) {
  const card: React.CSSProperties = { background: PC.card, border: `1px solid ${PC.border}`, borderRadius: 20, padding: 22 }
  const rows = Object.values(perClub || {})
    .filter((c: any) => c && c.ok && (c.membersTotal ?? 0) > 0 && ((c.membersOverdue ?? 0) > 0 || (c.pendingAmount ?? 0) > 0))
    .map((c: any) => ({ name: c.name, slug: c.slug, overdue: c.membersOverdue ?? 0, total: c.membersTotal ?? 0, pending: c.pendingAmount ?? 0, ratio: (c.membersOverdue ?? 0) / (c.membersTotal || 1) }))
    .sort((a, b) => b.ratio - a.ratio || b.pending - a.pending)

  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: PC.text }}>Morosidad por club</h2>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: PC.sub }}>Socios morosos y deuda pendiente (del último snapshot).</p>
      {rows.length === 0 ? (
        <p style={{ margin: '16px 0 0', fontSize: 13.5, color: PC.muted }}>Sin morosidad registrada (o aún no hay snapshot).</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {rows.slice(0, 6).map((r) => {
            const pct = Math.round(r.ratio * 100)
            const hot = r.ratio >= 0.2
            return (
              <div key={r.slug} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: PC.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: PC.muted }}>{r.overdue}/{r.total} morosos</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: hot ? PC.danger : PC.text, fontVariantNumeric: 'tabular-nums' }}>{pct}%</div>
                  {r.pending > 0 ? <div style={{ fontSize: 12, color: PC.sub }}>{fmtEur2(r.pending)}</div> : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
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

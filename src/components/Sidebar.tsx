'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { normalizeRole, ROLE_LABEL, type AppRole } from '@/lib/rbac'

// Unificado con el sistema de diseño (crm-vars.css): mismos tokens que el CRM,
// charcoal cálido y azul de marca (sin el degradado morado anterior).
const SIDEBAR_BG = 'var(--sidebar-bg)'
const SIDEBAR_TEXT = 'var(--sidebar-text)'
const SIDEBAR_BORDER = 'var(--sidebar-border)'
const ACCENT_GRADIENT = 'var(--accent)'
const SIDEBAR_ACTIVE_BG = 'var(--sidebar-active-bg)'

type IconName =
  | 'home'
  | 'calendar'
  | 'billing'
  | 'newspaper'
  | 'accounting'
  | 'bank'
  | 'receipt'
  | 'logout'
  | 'chevron'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'home':
      return (
        <svg {...props}>
          <path d="M3 12L12 3l9 9" />
          <path d="M5 10v10h14V10" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      )
    case 'billing':
      return (
        <svg {...props}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      )
    case 'newspaper':
      return (
        <svg {...props}>
          <path d="M4 4h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z" />
          <line x1="8" y1="8" x2="15" y2="8" />
          <line x1="8" y1="12" x2="15" y2="12" />
          <line x1="8" y1="16" x2="13" y2="16" />
        </svg>
      )
    case 'accounting':
      return (
        <svg {...props}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <line x1="8" y1="7" x2="16" y2="7" />
          <line x1="8" y1="11" x2="16" y2="11" />
          <line x1="8" y1="15" x2="12" y2="15" />
        </svg>
      )
    case 'bank':
      return (
        <svg {...props}>
          <path d="M3 10l9-6 9 6" />
          <path d="M5 10v8h14v-8" />
          <line x1="9" y1="14" x2="9" y2="18" />
          <line x1="15" y1="14" x2="15" y2="18" />
        </svg>
      )
    case 'receipt':
      return (
        <svg {...props}>
          <path d="M5 3h14v18l-3-2-3 2-3-2-3 2-2-2V3z" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="9" y1="12" x2="15" y2="12" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...props}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      )
    case 'chevron':
      return (
        <svg {...props}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )
  }
}

function initialsFromName(name?: string | null) {
  if (!name) return '—'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3)
}

function NavLink({
  href,
  icon,
  label,
  active,
  badge,
}: {
  href: string
  icon: IconName
  label: string
  active: boolean
  badge?: ReactNode
}) {
  const baseStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    background: active ? SIDEBAR_ACTIVE_BG : 'transparent',
    color: active ? '#fff' : SIDEBAR_TEXT,
    fontFamily: 'inherit',
    fontSize: 13.5,
    fontWeight: active ? 600 : 400,
    textAlign: 'left' as const,
    width: '100%',
    transition: 'all 0.15s',
    textDecoration: 'none',
  }
  return (
    <Link href={href} style={baseStyle}>
      <span style={{ opacity: active ? 1 : 0.7, flexShrink: 0, display: 'inline-flex' }}>
        <Icon name={icon} size={16} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {badge}
    </Link>
  )
}

function isAccountingSectionPath(path: string) {
  return path === '/accounting' || path.startsWith('/accounting/')
}

export type SidebarBranding = {
  name: string
  logoUrl: string | null
}

export function Sidebar({ branding }: { branding?: SidebarBranding } = {}) {
  const pathname = usePathname() || ''
  const { data: session } = useSession()
  const clubName = (branding?.name || 'ProClubCRM').trim() || 'ProClubCRM'
  const clubLogo = branding?.logoUrl || null
  const clubInitial = clubName.charAt(0).toUpperCase() || 'P'
  const [accountingOpen, setAccountingOpen] = useState(() => isAccountingSectionPath(pathname))

  useEffect(() => {
    if (isAccountingSectionPath(pathname)) setAccountingOpen(true)
  }, [pathname])

  const isJoinRoute = pathname === '/join' || pathname.startsWith('/join/')
  const isPublicEventShare =
    /^\/events\/[^/]+$/.test(pathname) && pathname !== '/events/new'
  if (pathname === '/login' || isJoinRoute) return null
  if (isPublicEventShare && !session) return null

  const role: AppRole = normalizeRole(session?.user?.role)
  const isStaff = role === 'ADMIN' || role === 'COACH' || role === 'TREASURER'
  const userName = session?.user?.name || session?.user?.email || 'Usuario'
  const initials = initialsFromName(session?.user?.name || session?.user?.email || '')

  const memberLinks = useMemo(
    () =>
      [
        { href: '/', icon: 'home' as IconName, label: 'Inicio', active: pathname === '/' },
        {
          href: '/calendar',
          icon: 'calendar' as IconName,
          label: 'Calendario',
          active: pathname === '/calendar' || pathname.startsWith('/calendar/'),
        },
        {
          href: '/my-billing',
          icon: 'billing' as IconName,
          label: 'Mis Pagos',
          active: pathname === '/my-billing' || pathname.startsWith('/my-billing/'),
        },
        {
          href: '/mural',
          icon: 'newspaper' as IconName,
          label: 'Mural',
          active: pathname === '/mural' || pathname.startsWith('/mural/'),
        },
      ],
    [pathname],
  )

  return (
    <div
      className="sidebar"
      style={{
        width: 220,
        background: SIDEBAR_BG,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: '100vh',
        overflow: 'hidden',
        transition: 'width 0.2s',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '24px 20px 20px',
          borderBottom: `1px solid ${SIDEBAR_BORDER}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: clubLogo ? '#fff' : ACCENT_GRADIENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              fontSize: 16,
              fontWeight: 800,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {clubLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clubLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 3 }} />
            ) : (
              clubInitial
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
              title={clubName}
            >
              {clubName}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
              Club Multideporte
            </div>
          </div>
        </div>
      </div>

      {/* User card */}
      <div
        style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${SIDEBAR_BORDER}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: ACCENT_GRADIENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 138,
              }}
            >
              {userName}
            </div>
            <div
              style={{
                display: 'inline-block',
                background: 'rgba(37,99,235,0.28)',
                color: '#bcd2fb',
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 7px',
                borderRadius: 999,
                letterSpacing: 1,
                marginTop: 3,
                textTransform: 'uppercase',
              }}
            >
              {ROLE_LABEL[role] || 'Socio'}
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          padding: '12px 12px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1.5,
            padding: '8px 8px 4px',
            textTransform: 'uppercase',
          }}
        >
          Menú
        </div>

        {isStaff ? (
          <>
            <NavLink
              href="/"
              icon="home"
              label="Panel CRM"
              active={pathname === '/'}
            />
            {(role === 'ADMIN' || role === 'TREASURER') && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setAccountingOpen((v) => !v)}
                  aria-expanded={accountingOpen}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: 'none',
                    cursor: 'pointer',
                    background: isAccountingSectionPath(pathname)
                      ? SIDEBAR_ACTIVE_BG
                      : 'transparent',
                    color: isAccountingSectionPath(pathname) ? '#fff' : SIDEBAR_TEXT,
                    fontFamily: 'inherit',
                    fontSize: 13.5,
                    fontWeight: isAccountingSectionPath(pathname) ? 600 : 400,
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <span style={{ opacity: 0.85, display: 'inline-flex' }}>
                    <Icon name="accounting" size={16} />
                  </span>
                  <span style={{ flex: 1 }}>Contabilidad</span>
                  <span
                    style={{
                      transform: accountingOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s',
                      display: 'inline-flex',
                      opacity: 0.6,
                    }}
                  >
                    <Icon name="chevron" size={14} />
                  </span>
                </button>
                {accountingOpen && (
                  <div
                    style={{
                      marginLeft: 22,
                      paddingLeft: 12,
                      borderLeft: `1px solid ${SIDEBAR_BORDER}`,
                      marginTop: 4,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <NavLink
                      href="/accounting"
                      icon="accounting"
                      label="Resumen"
                      active={pathname === '/accounting'}
                    />
                    <NavLink
                      href="/?tab=contabilidad"
                      icon="receipt"
                      label="Contabilidad CRM"
                      active={false}
                    />
                    <NavLink
                      href="/accounting/bank-import"
                      icon="bank"
                      label="Extracto bancario"
                      active={pathname.startsWith('/accounting/bank-import')}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          memberLinks.map((l) => (
            <NavLink
              key={l.href}
              href={l.href}
              icon={l.icon}
              label={l.label}
              active={l.active}
            />
          ))
        )}
      </nav>

      {/* Logout */}
      <div style={{ padding: 12, borderTop: `1px solid ${SIDEBAR_BORDER}` }}>
        <button
          type="button"
          onClick={async () => {
            // MT: cierra sesión sin redirect de servidor (evita NEXTAUTH_URL) y
            // navega en el mismo origen, conservando la cookie de tenant.
            await signOut({ redirect: false })
            window.location.href = '/login'
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 12px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            background: 'transparent',
            color: '#f87171',
            fontFamily: 'inherit',
            fontSize: 13.5,
            fontWeight: 600,
            textAlign: 'left',
            width: '100%',
          }}
        >
          <span style={{ display: 'inline-flex', opacity: 0.9 }}>
            <Icon name="logout" size={16} />
          </span>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  )
}

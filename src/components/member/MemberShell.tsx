'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  BellIcon,
  CalendarIcon,
  GridIcon,
  HelpIcon,
  HomeIcon,
  LogoutIcon,
  PaymentsIcon,
  SearchIcon,
} from './icons'

const SIDEBAR_BG = '#141b2b'
const PRIMARY = '#0058be'

function initialsFromName(name?: string | null) {
  if (!name) return '—'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

type NavItem = {
  href: string
  label: string
  icon: 'home' | 'calendar' | 'payments' | 'grid'
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Inicio', icon: 'home' },
  { href: '/calendar', label: 'Calendario', icon: 'calendar' },
  { href: '/my-billing', label: 'Mis Pagos', icon: 'payments' },
  { href: '/mural', label: 'Mural', icon: 'grid' },
]

function NavIcon({ name, size = 20 }: { name: NavItem['icon']; size?: number }) {
  switch (name) {
    case 'home':
      return <HomeIcon size={size} />
    case 'calendar':
      return <CalendarIcon size={size} />
    case 'payments':
      return <PaymentsIcon size={size} />
    case 'grid':
      return <GridIcon size={size} />
  }
}

function isActiveItem(item: NavItem, pathname: string) {
  if (item.href === '/') return pathname === '/'
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export type MemberShellBranding = {
  name: string
  logoUrl: string | null
  primaryColor: string | null
  subtitle?: string | null
}

function resolveBranding(
  server?: MemberShellBranding,
  live?: MemberShellBranding | null,
): MemberShellBranding {
  const pick = live ?? server
  return {
    name: (pick?.name || 'Furvoley').trim() || 'Furvoley',
    logoUrl: pick?.logoUrl ?? null,
    primaryColor: pick?.primaryColor ?? null,
    subtitle: pick?.subtitle?.trim() || null,
  }
}

export function MemberShell({
  children,
  branding: serverBranding,
}: {
  children: ReactNode
  branding?: MemberShellBranding
}) {
  const pathname = usePathname() || ''
  const { data: session } = useSession()
  const [liveBranding, setLiveBranding] = useState<MemberShellBranding | null>(null)

  const refreshBranding = useCallback(async () => {
    try {
      const r = await fetch('/api/public/club-branding', { cache: 'no-store' })
      if (!r.ok) return
      const j = (await r.json()) as { branding?: MemberShellBranding }
      if (j.branding?.name) setLiveBranding(j.branding)
    } catch {
      // Sin branding en vivo: se usa el del servidor.
    }
  }, [])

  useEffect(() => {
    void refreshBranding()
    const onUpdate = () => void refreshBranding()
    window.addEventListener('club-settings-updated', onUpdate)
    return () => window.removeEventListener('club-settings-updated', onUpdate)
  }, [refreshBranding])

  const branding = resolveBranding(serverBranding, liveBranding)
  const userName = session?.user?.name || session?.user?.email || 'Socio'
  const initials = initialsFromName(session?.user?.name || session?.user?.email || '')
  const clubName = branding.name
  const clubLogo = branding.logoUrl
  const clubSubtitle = branding.subtitle
  const accent = branding.primaryColor?.trim() || PRIMARY

  return (
    <div
      className="flex w-full min-h-screen"
      style={{ background: '#f9f9ff', color: '#191b23', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* Sidebar */}
      <aside
        className="flex flex-col py-6 flex-shrink-0 sticky top-0 z-40"
        style={{
          width: 280,
          height: '100vh',
          background: SIDEBAR_BG,
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        }}
      >
        <div className="px-6 mb-10" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {clubLogo ? (
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                overflow: 'hidden',
                background: '#fff',
                border: '1px solid rgba(255,255,255,0.12)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={clubLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
            </div>
          ) : null}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1
              className="font-black tracking-tighter"
              style={{
                color: '#fff',
                fontSize: 28,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={clubName}
            >
              {clubName}
            </h1>
            {clubSubtitle ? (
              <p
                className="mt-1"
                style={{
                  color: 'rgba(255,255,255,0.55)',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  lineHeight: 1.3,
                }}
              >
                {clubSubtitle}
              </p>
            ) : null}
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActiveItem(item, pathname)
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-6 py-3 transition-all"
                style={{
                  borderLeft: active ? `4px solid ${accent}` : '4px solid transparent',
                  background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                  fontWeight: active ? 700 : 500,
                  fontSize: 14,
                  textDecoration: 'none',
                  letterSpacing: '0.02em',
                }}
              >
                <span style={{ display: 'inline-flex', opacity: active ? 1 : 0.85 }}>
                  <NavIcon name={item.icon} size={20} />
                </span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div
          className="px-6 mt-auto pt-6 flex flex-col gap-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          <button
            type="button"
            onClick={async () => {
              // MT: cierra sesión sin redirect de servidor (evita NEXTAUTH_URL) y
              // navega en el mismo origen, conservando la cookie de tenant.
              await signOut({ redirect: false })
              window.location.href = '/login'
            }}
            className="flex items-center gap-3 py-2 transition-colors"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#ffb4ab',
              fontSize: 14,
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            <LogoutIcon size={20} />
            <span>Cerrar sesión</span>
          </button>

          <div
            className="mt-4 p-4 rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  width: 40,
                  height: 40,
                  background: `linear-gradient(135deg, ${accent}, ${accent})`,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  border: `1px solid ${accent}99`,
                }}
              >
                {initials}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  className="truncate"
                  style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}
                >
                  {userName}
                </p>
                <p
                  style={{
                    color: `${accent}cc`,
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    marginTop: 2,
                  }}
                >
                  Socio Activo
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0" style={{ height: '100vh' }}>
        <header
          className="h-16 flex justify-between items-center px-10 sticky top-0 z-30 flex-shrink-0"
          style={{
            background: 'rgba(249,249,255,0.85)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(194,198,214,0.3)',
          }}
        >
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <div className="relative w-full">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: '#727785' }}
              >
                <SearchIcon size={18} />
              </span>
              <input
                type="text"
                placeholder="Buscar..."
                className="w-full rounded-full py-2 pl-10 pr-4 outline-none transition-all"
                style={{
                  background: '#f2f3fd',
                  border: 'none',
                  fontSize: 14,
                  color: '#191b23',
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Notificaciones"
                className="rounded-full transition-colors"
                style={{
                  padding: 8,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#424754',
                }}
              >
                <BellIcon size={20} />
              </button>
              <button
                type="button"
                aria-label="Ayuda"
                className="rounded-full transition-colors"
                style={{
                  padding: 8,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#424754',
                }}
              >
                <HelpIcon size={20} />
              </button>
            </div>

            <div
              className="flex items-center gap-3 pl-6"
              style={{ borderLeft: '1px solid rgba(194,198,214,0.3)' }}
            >
              <div className="text-right hidden sm:block">
                <p style={{ fontWeight: 700, fontSize: 13, color: '#191b23' }}>{userName}</p>
                <span
                  style={{
                    background: `${accent}1a`,
                    color: accent,
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: '0.18em',
                  }}
                >
                  SOCIO
                </span>
              </div>
              <div
                className="rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  width: 40,
                  height: 40,
                  background: `linear-gradient(135deg, ${accent}, ${accent})`,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  border: '2px solid #e6e7f2',
                  cursor: 'pointer',
                }}
              >
                {initials}
              </div>
            </div>
          </div>
        </header>

        <main
          className="flex-1 overflow-y-auto"
          style={{
            background: '#f9f9ff',
            padding: '32px 40px 56px',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

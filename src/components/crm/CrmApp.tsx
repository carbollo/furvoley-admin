// @ts-nocheck
'use client'

import { WorkflowsSection } from './WorkflowsSection'
import { ClubSettingsModal } from './ClubSettingsModal'
import { PaymentReminderButton } from './PaymentReminderButton'
import { InviteLinkButton } from './InviteLinkButton'
import './crm-vars.css'
import { Plus_Jakarta_Sans } from 'next/font/google'
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useContext,
  createContext,
  type ReactNode,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { canAccessCrmSection, normalizeRole, ROLE_LABEL } from '@/lib/rbac'

type CrmCtx = {
  bundle: Record<string, unknown> | null
  reload: () => Promise<unknown>
  loading: boolean
  error: string | null
  fmtMoney: (n: number) => string
  showAlert: (message: string) => void
  showConfirm: (message: string) => Promise<boolean>
}

const CrmContext = createContext<CrmCtx | null>(null);
function useCrm(): CrmCtx {
  const c = useContext(CrmContext);
  if (!c) throw new Error('CrmContext');
  return c;
}

function CrmProvider({ children }: { children: ReactNode }) {
  const [bundle, setBundle] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popup, setPopup] = useState<{
    kind: 'alert' | 'confirm'
    message: string
    onResolve?: (ok: boolean) => void
  } | null>(null)
  const reload = useCallback(async () => {
    const r = await fetch('/api/crm/data', { credentials: 'include', cache: 'no-store' });
    if (r.status === 401) {
      window.location.href = '/login?callbackUrl=' + encodeURIComponent('/');
      throw new Error('No autorizado');
    }
    if (!r.ok) throw new Error('No se pudieron cargar los datos');
    const j = await r.json();
    setBundle(j);
    return j;
  }, []);
  useEffect(() => {
    reload().catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, [reload]);
  useEffect(() => {
    function onUpdated() { reload().catch(() => {}) }
    window.addEventListener('club-settings-updated', onUpdated)
    return () => window.removeEventListener('club-settings-updated', onUpdated)
  }, [reload]);
  const fmtMoney = useCallback((n: number) => {
    const cur = String(bundle?.currency ?? 'EUR')
    try {
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
    } catch {
      return '€' + Number(n).toLocaleString('es-AR');
    }
  }, [bundle?.currency]);

  const showAlert = useCallback((message: string) => {
    setPopup({ kind: 'alert', message })
  }, [])

  const showConfirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setPopup({
        kind: 'confirm',
        message,
        onResolve: resolve,
      })
    })
  }, [])

  const closePopup = useCallback((ok: boolean) => {
    setPopup((current) => {
      if (current?.kind === 'confirm' && current.onResolve) {
        current.onResolve(ok)
      }
      return null
    })
  }, [])

  return (
    <CrmContext.Provider value={{ bundle, reload, loading, error, fmtMoney, showAlert, showConfirm }}>
      {children}
      {popup && (
        <div
          role="presentation"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return
            closePopup(false)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1300,
            background: 'rgba(15,23,42,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 460,
              background: '#fff',
              borderRadius: 14,
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 24px 50px rgba(15,23,42,0.24)',
              padding: 22,
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
              {popup.kind === 'confirm' ? 'Confirmar acción' : 'Aviso'}
            </div>
            <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.5, marginBottom: 18 }}>
              {popup.message}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              {popup.kind === 'confirm' && (
                <button
                  type="button"
                  onClick={() => closePopup(false)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: '#fff',
                    color: '#475569',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                  }}
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={() => closePopup(true)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                }}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </CrmContext.Provider>
  );
}

// ── SVG CHARTS ──────────────────────────────────────────────────────────────
function MiniLineChart({ data, color = "var(--accent)", height = 40, width = 120 }) {
  const d = data && data.length ? data : [0];
  const max = Math.max(...d);
  const min = Math.min(...d);
  const range = max - min || 1;
  const pts = d.map((v, i) => {
    const x = (i / (d.length - 1 || 1)) * width;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  }).join(' ');
  const area = `0,${height} ${pts} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <defs>
        <linearGradient id={`lg${color.replace(/[^a-z0-9]/gi,'')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#lg${color.replace(/[^a-z0-9]/gi,'')})`}/>
      <polyline points={pts} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function BarChart({ data, secondaryData = [], labels, color = "#3B82F6", secondaryColor = "#EF4444", height = 170 }) {
  const safeData = data && data.length ? data : [0];
  const safeSecondary = secondaryData.length === safeData.length ? secondaryData : safeData.map(() => 0);
  const safeLabels = labels && labels.length === safeData.length ? labels : safeData.map(() => '');
  const max = Math.max(1, ...safeData, ...safeSecondary);
  const groupW = 62;
  const chartW = safeData.length * groupW;
  const baseY = height - 28;
  const barMaxH = height - 62;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${chartW} ${height}`} preserveAspectRatio="none">
      {[0, 1, 2, 3].map((r) => {
        const y = 18 + r * ((baseY - 18) / 3);
        return <line key={r} x1="0" y1={y} x2={chartW} y2={y} stroke="#e2e8f0" strokeWidth="1" />;
      })}
      {safeData.map((v, i) => {
        const v2 = safeSecondary[i] ?? 0;
        const h1 = max > 0 ? (v / max) * barMaxH : 0;
        const h2 = max > 0 ? (v2 / max) * barMaxH : 0;
        const groupX = i * groupW;
        const x = groupX + 11;
        const groupCenter = groupX + groupW / 2;
        const y1 = baseY - h1;
        const y2 = baseY - h2;
        return (
          <g key={i}>
            <rect x={x} y={y1} width="16" height={h1} rx="5" fill={color} opacity="0.9" />
            <rect x={x + 24} y={y2} width="16" height={h2} rx="5" fill={secondaryColor} opacity="0.88" />
            <rect x={groupX} y={18} width={groupW} height={baseY - 10} fill="transparent">
              <title>{`${safeLabels[i]} · Ingresos: ${Math.round(v)} · Gastos: ${Math.round(v2)}`}</title>
            </rect>
            <text x={groupCenter} y={height - 8} textAnchor="middle" fontSize="10.5" fill="#64748b" fontFamily="Plus Jakarta Sans" fontWeight="600">
              {safeLabels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ segments, size = 100 }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total <= 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={size * 0.3} fill="none" stroke="#e5e7eb" strokeWidth={size * 0.12} />
      </svg>
    );
  }
  let cumAngle = -90;
  const cx = size / 2, cy = size / 2, r = size * 0.38, inner = size * 0.25;
  const paths = segments.map(seg => {
    const angle = (seg.value / total) * 360;
    const startRad = (cumAngle * Math.PI) / 180;
    const endRad = ((cumAngle + angle) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const ix1 = cx + inner * Math.cos(startRad);
    const iy1 = cy + inner * Math.sin(startRad);
    const ix2 = cx + inner * Math.cos(endRad);
    const iy2 = cy + inner * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${inner} ${inner} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
    cumAngle += angle;
    return <path key={seg.label} d={d} fill={seg.color}/>;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>{paths}</svg>
  );
}

// ── ICONS ───────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 18 }) => {
  const icons = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    teams: <><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></>,
    billing: <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    reports: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    workflows: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></>,
    whatsapp: <><path d="M20 11.2c0 4.6-3.8 8.3-8.5 8.3-1.3 0-2.6-.3-3.8-.9L3 20l1.5-4.5c-.7-1.3-1-2.7-1-4.3C3.5 6.6 7.3 3 12 3s8 3.6 8 8.2z"/><path d="M8.8 9.5c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .5.4.2.4.6 1.4.7 1.6.1.2.1.4 0 .6-.1.2-.2.3-.4.5-.2.2-.3.3-.4.5-.1.2 0 .4.1.5.2.2.9 1.5 2.3 2 .4.2.7.1.9 0 .2-.1.6-.7.8-.9.2-.2.4-.2.6-.1.2.1 1.3.6 1.6.7.2.1.4.2.4.4 0 .2 0 1.1-.7 1.7-.7.6-1.6.6-2.2.5-.6-.1-3.1-1.2-4.5-3.8-.3-.5-.8-1.6-.8-2.3 0-.6.3-.9.4-1.1z"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    chevron: <polyline points="9 18 15 12 9 6"/>,
    trend_up: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    trend_down: <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></>,
    play: <polygon points="5 3 19 12 5 21 5 3"/>,
    pause: <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
    zap: <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
    arrow_right: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    dots: <><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></>,
    export: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
};

// ── SHARED COMPONENTS ───────────────────────────────────────────────────────
const Badge = ({ status }) => {
  const cfg = {
    Activo: { bg: 'var(--green-light)', color: 'var(--green)', label: 'Activo' },
    Inactivo: { bg: '#F1F5F9', color: '#64748b', label: 'Inactivo' },
    Moroso: { bg: 'var(--red-light)', color: 'var(--red)', label: 'Moroso' },
    Pagado: { bg: 'var(--green-light)', color: 'var(--green)', label: 'Pagado' },
    Pendiente: { bg: 'var(--amber-light)', color: 'var(--amber)', label: 'Pendiente' },
    Vencido: { bg: 'var(--red-light)', color: 'var(--red)', label: 'Vencido' },
  };
  const c = cfg[status] || cfg.Inactivo;
  return (
    <span style={{
      display:'inline-flex',alignItems:'center',gap:5,
      padding:'3px 10px',borderRadius:999,fontSize:12,fontWeight:600,
      background:c.bg,color:c.color
    }}>
      <span style={{width:6,height:6,borderRadius:'50%',background:c.color,flexShrink:0}}></span>
      {c.label}
    </span>
  );
};

function Avatar({ initials, color = '#3B82F6', size = 36 }) {
  return (
    <div style={{
      width:size,height:size,borderRadius:'50%',
      background:`${color}20`,color,
      display:'flex',alignItems:'center',justifyContent:'center',
      fontSize:size*0.36,fontWeight:700,flexShrink:0
    }}>{initials}</div>
  );
}

const KPICard = ({ label, value, sub, icon, color, trend, badge, chart }) => {
  // badge: { kind: 'success' | 'warning' | 'danger' | 'info', text: string }
  const badgeStyles = {
    success: { bg: 'var(--green-soft)', color: 'var(--green)' },
    warning: { bg: 'var(--amber-soft)', color: 'var(--amber)' },
    danger:  { bg: 'var(--red-soft)',   color: 'var(--red)' },
    info:    { bg: 'var(--accent-pill)',color: 'var(--accent)' },
  }
  const trendBadge = trend ? {
    kind: trend.up ? 'success' : 'danger',
    text: trend.text || (trend.up ? '+' : '-'),
    icon: trend.up ? 'trend_up' : 'trend_down',
  } : null
  const showBadge = badge || trendBadge
  const bStyle = showBadge ? (badgeStyles[showBadge.kind] || badgeStyles.info) : null
  return (
    <div style={{
      background:'var(--surface-card)',borderRadius:12,padding:'24px',
      boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',
      display:'flex',flexDirection:'column',gap:16,flex:'1 1 240px',minWidth:0,
      transition:'all 0.2s ease',
    }}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
        <div style={{
          width:40,height:40,borderRadius:10,
          background:`${color}15`,color,
          display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0
        }}>
          <Icon name={icon} size={20}/>
        </div>
        {showBadge && (
          <span style={{
            display:'inline-flex',alignItems:'center',gap:4,
            padding:'4px 10px',borderRadius:999,
            background:bStyle.bg,color:bStyle.color,
            fontSize:11,fontWeight:700,letterSpacing:'0.02em',whiteSpace:'nowrap'
          }}>
            {(showBadge.icon || (trendBadge && trendBadge.icon)) && <Icon name={showBadge.icon || trendBadge.icon} size={12}/>}
            {showBadge.text}
          </span>
        )}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        <span style={{
          fontSize:11,color:'var(--text-muted)',fontWeight:700,
          letterSpacing:'0.05em',textTransform:'uppercase'
        }}>{label}</span>
        <span style={{
          fontSize:30,fontWeight:700,letterSpacing:'-0.02em',
          color:'var(--text-primary)',lineHeight:1.1
        }}>{value}</span>
        {sub && (
          <span style={{fontSize:12,color:'var(--text-muted)',fontWeight:500}}>{sub}</span>
        )}
      </div>
      {chart && (
        <div style={{marginTop:'auto',opacity:0.85}}>
          <MiniLineChart data={chart} color={color} width={120} height={32}/>
        </div>
      )}
    </div>
  )
};

// ── SIDEBAR ─────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard', label: 'Inicio', icon: 'dashboard' },
  { id: 'socios', label: 'Socios', icon: 'users' },
  { id: 'equipos', label: 'Equipos', icon: 'teams' },
  { id: 'contabilidad', label: 'Contabilidad', icon: 'billing' },
  { id: 'calendario', label: 'Calendario', icon: 'calendar' },
  { id: 'informes', label: 'Informes', icon: 'reports' },
  { id: 'workflows', label: 'Flujos', icon: 'workflows' },
  { id: 'whatsapp', label: 'Whatsapp', icon: 'whatsapp' },
  { id: 'personal', label: 'Personal', icon: 'users' },
];

function Sidebar({ active, setActive, onOpenClubSettings }) {
  const { bundle } = useCrm();
  const role = normalizeRole(bundle?.user?.role)
  const visibleNav = NAV.filter((item) => canAccessCrmSection(role, item.id))
  const pending = bundle?.kpis?.cobrosPendientes ?? 0;
  return (
    <div className="sidebar" style={{
      width:280,background:'var(--sidebar-bg)',display:'flex',flexDirection:'column',
      flexShrink:0,height:'100vh',overflow:'hidden',
      borderRight:'1px solid var(--sidebar-border)',
      boxShadow:'4px 0 24px rgba(15,23,42,0.04)'
    }}>
      {/* Brand */}
      <div style={{padding:'28px 24px 24px',display:'flex',alignItems:'center',gap:12}}>
        {bundle?.club?.logoUrl ? (
          <div style={{
            width:42,height:42,borderRadius:10,overflow:'hidden',flexShrink:0,
            background:'#ffffff',border:'1px solid rgba(255,255,255,0.08)',
            display:'flex',alignItems:'center',justifyContent:'center',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bundle.club.logoUrl} alt="" style={{width:'100%',height:'100%',objectFit:'contain',padding:4}} />
          </div>
        ) : null}
        <div style={{minWidth:0,flex:1}}>
          <div style={{
            color:'#ffffff',fontWeight:700,fontSize:22,letterSpacing:'-0.02em',lineHeight:1.1,
            whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'
          }}>{bundle?.club?.name || 'Furvoley'}</div>
          <div style={{
            color:'#64748b',fontSize:11,fontWeight:700,
            letterSpacing:'0.08em',marginTop:6,textTransform:'uppercase'
          }}>Sistema de gestión</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{flex:1,padding:'4px 0 12px',overflowY:'auto',display:'flex',flexDirection:'column',gap:2}}>
        {visibleNav.map(item => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              title={item.label}
              style={{
                display:'flex',alignItems:'center',gap:12,
                padding:'12px 24px',
                border:'none',cursor:'pointer',
                borderLeft: isActive ? '4px solid var(--accent)' : '4px solid transparent',
                background:isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                color:isActive ? 'var(--sidebar-active)' : 'var(--sidebar-text)',
                fontFamily:'inherit',fontSize:14,fontWeight:isActive ? 600 : 500,
                textAlign:'left',width:'100%',transition:'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.color = 'var(--sidebar-text-hover)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--sidebar-text)'
                }
              }}
            >
              <span style={{
                opacity:isActive ? 1 : 0.9,flexShrink:0,display:'inline-flex'
              }}>
                <Icon name={item.icon} size={18}/>
              </span>
              <span style={{flex:1}}>{item.label}</span>
              {item.id === 'contabilidad' && pending > 0 && (
                <span style={{
                  background:'var(--red)',color:'#fff',
                  fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:999
                }}>{pending > 99 ? '99+' : pending}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User block + actions */}
      <div style={{
        marginTop:'auto',borderTop:'1px solid var(--sidebar-border)',
        padding:'16px 0 12px',display:'flex',flexDirection:'column'
      }}>
        {role === 'ADMIN' && onOpenClubSettings ? (
          <button
            type="button"
            onClick={onOpenClubSettings}
            title="Configuración del club"
            style={{
              display:'flex',alignItems:'center',gap:12,width:'100%',
              padding:'10px 24px 12px',border:'none',cursor:'pointer',
              background:'transparent',color:'inherit',fontFamily:'inherit',
              textAlign:'left',transition:'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{
              width:40,height:40,borderRadius:'50%',
              background:'linear-gradient(135deg, #2563eb, #004ac6)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:14,fontWeight:700,color:'#fff',flexShrink:0,
              border:'1px solid rgba(255,255,255,0.08)'
            }}>{bundle?.user?.initials || '—'}</div>
            <div style={{minWidth:0,flex:1}}>
              <div style={{
                color:'#ffffff',fontWeight:600,fontSize:14,lineHeight:1.2,
                whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'
              }}>{bundle?.user?.name || 'Administrador'}</div>
              <div style={{
                color:'#64748b',fontSize:11,fontWeight:700,
                letterSpacing:'0.06em',textTransform:'uppercase',marginTop:2
              }}>{ROLE_LABEL[role] || 'Socio'}</div>
            </div>
            <span aria-hidden style={{color:'#64748b',fontSize:14,flexShrink:0,opacity:0.7}}>⚙</span>
          </button>
        ) : (
          <div style={{padding:'8px 24px 12px',display:'flex',alignItems:'center',gap:12}}>
            <div style={{
              width:40,height:40,borderRadius:'50%',
              background:'linear-gradient(135deg, #2563eb, #004ac6)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:14,fontWeight:700,color:'#fff',flexShrink:0,
              border:'1px solid rgba(255,255,255,0.08)'
            }}>{bundle?.user?.initials || '—'}</div>
            <div style={{minWidth:0,flex:1}}>
              <div style={{
                color:'#ffffff',fontWeight:600,fontSize:14,lineHeight:1.2,
                whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'
              }}>{bundle?.user?.name || 'Administrador'}</div>
              <div style={{
                color:'#64748b',fontSize:11,fontWeight:700,
                letterSpacing:'0.06em',textTransform:'uppercase',marginTop:2
              }}>{ROLE_LABEL[role] || 'Socio'}</div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => { window.location.href = '/api/auth/signout?callbackUrl=' + encodeURIComponent('/login'); }}
          style={{
            display:'flex',alignItems:'center',gap:12,width:'100%',
            padding:'12px 24px',border:'none',cursor:'pointer',
            background:'transparent',color:'var(--sidebar-text)',
            fontFamily:'inherit',fontSize:14,fontWeight:500,textAlign:'left',
            transition:'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#fca5a5' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sidebar-text)' }}
        >
          <Icon name="logout" size={18}/>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}

// ── DASHBOARD ───────────────────────────────────────────────────────────────
function Dashboard({ setActive }) {
  const { bundle, fmtMoney } = useCrm();
  const userRole = normalizeRole(bundle?.user?.role)
  if (userRole !== 'ADMIN') {
    return null
  }
  const meta = bundle?.meta?.today ? new Date(bundle.meta.today) : new Date();
  const ingresosMes = bundle?.ingresosMensual ?? Array(12).fill(0);
  const kp = bundle?.kpis;
  const donut = bundle?.sociosPorDeporte ?? [];
  const EVENTOS_UI = bundle?.eventos ?? [];
  const COBROS_UI = bundle?.cobros ?? [];

  const ACCENT_SOFT = '#2563eb';
  const AMBER = '#f59e0b';
  const GREEN = '#059669';
  const RED = '#e11d48';
  const cobrosPendMonto = kp?.cobrosPendientesMonto ?? 0
  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--surface)'}}>
      <div style={{maxWidth:1440,margin:'0 auto',padding:'32px 40px 56px',display:'flex',flexDirection:'column',gap:32}}>
        {/* KPI Grid */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',
          gap:24
        }}>
          <KPICard
            label="Socios activos"
            value={String(kp?.sociosActivos ?? 0)}
            sub="Altas activas en el club"
            icon="users"
            color={ACCENT_SOFT}
            badge={{ kind:'success', text:'Activo', icon:'trend_up' }}
            chart={ingresosMes.slice(-7).length ? ingresosMes.slice(-7) : [0,0,0]}
          />
          <KPICard
            label="Cobros pendientes"
            value={kp ? fmtMoney(cobrosPendMonto) : '—'}
            sub={`${kp?.cobrosPendientes ?? 0} factura(s) por cobrar`}
            icon="billing"
            color={AMBER}
            badge={(kp?.cobrosPendientes ?? 0) > 0 ? { kind:'warning', text:'En espera' } : null}
            chart={[2,4,3,5,4,6, kp?.cobrosPendientes ?? 0]}
          />
          <KPICard
            label="Ingresos del mes"
            value={kp ? fmtMoney(kp.ingresosMes) : '—'}
            sub="Ingresos registrados"
            icon="reports"
            color={GREEN}
            badge={(kp?.ingresosMes ?? 0) > 0 ? { kind:'success', text:'+', icon:'trend_up' } : null}
            chart={ingresosMes.slice(-7)}
          />
          <KPICard
            label="Facturas vencidas"
            value={String(kp?.facturasVencidas ?? 0)}
            sub={(kp?.facturasVencidas ?? 0) > 0 ? 'Requieren atención' : 'Todo en orden'}
            icon="billing"
            color={RED}
            badge={(kp?.facturasVencidas ?? 0) > 0 ? { kind:'danger', text:'Crítico' } : { kind:'success', text:'OK' }}
            chart={[1,2,1,3,2, kp?.facturasVencidas ?? 0, kp?.facturasVencidas ?? 0]}
          />
        </div>

        {/* Bento: chart (8) + donut (4) */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'minmax(0, 2fr) minmax(0, 1fr)',
          gap:24
        }}>
          <div style={{
            background:'var(--surface-card)',borderRadius:12,padding:32,
            boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',
            display:'flex',flexDirection:'column'
          }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24,gap:12,flexWrap:'wrap'}}>
              <div>
                <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Ingresos del año</div>
                <div style={{fontSize:14,color:'var(--text-secondary)',marginTop:4}}>Resumen mensual de facturación</div>
              </div>
              <div style={{display:'flex',gap:4,background:'var(--surface-low)',borderRadius:999,padding:4}}>
                <span style={{padding:'6px 14px',fontSize:12,fontWeight:700,borderRadius:999,background:'var(--surface-card)',color:'var(--accent)',boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>{meta.getFullYear()}</span>
              </div>
            </div>
            <BarChart data={ingresosMes} labels={['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']} color={ACCENT_SOFT} height={220}/>
          </div>
          <div style={{
            background:'var(--surface-card)',borderRadius:12,padding:32,
            boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',
            display:'flex',flexDirection:'column'
          }}>
            <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Socios por equipo</div>
            <div style={{fontSize:14,color:'var(--text-secondary)',marginTop:4,marginBottom:24}}>Distribución por categorías</div>
            <div style={{display:'flex',justifyContent:'center',marginBottom:24,position:'relative'}}>
              <div style={{position:'relative',width:170,height:170}}>
                <DonutChart
                  size={170}
                  segments={donut.length ? donut.map(d => ({ label: d.label, value: Math.max(d.value, 1), color: d.color })) : [{ label: '—', value: 1, color: '#e2e8f0' }]}
                />
                <div style={{
                  position:'absolute',inset:0,display:'flex',flexDirection:'column',
                  alignItems:'center',justifyContent:'center',pointerEvents:'none'
                }}>
                  <span style={{fontSize:24,fontWeight:700,color:'var(--text-primary)',letterSpacing:'-0.02em'}}>{kp?.sociosActivos ?? 0}</span>
                  <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase',marginTop:2}}>Total</span>
                </div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:'auto'}}>
              {donut.map(d => {
                const total = donut.reduce((a, x) => a + (x.value || 0), 0) || 1
                const pct = Math.round(((d.value || 0) / total) * 100)
                return (
                  <div key={d.label} style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{width:10,height:10,borderRadius:'50%',background:d.color,flexShrink:0}}></span>
                    <span style={{fontSize:13,color:'var(--text-primary)',flex:1}}>{d.label}</span>
                    <span style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)'}}>{d.value} <span style={{color:'var(--text-muted)',fontWeight:500}}>({pct}%)</span></span>
                  </div>
                )
              })}
              {donut.length === 0 && <div style={{fontSize:13,color:'var(--text-muted)'}}>Sin datos de equipos</div>}
            </div>
          </div>
        </div>

        {/* Bento: próximos eventos (5) + cobros recientes (7) */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'minmax(0, 5fr) minmax(0, 7fr)',
          gap:24
        }}>
          {/* Próximos eventos */}
          <div style={{
            background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',
            boxShadow:'var(--card-shadow)',overflow:'hidden',display:'flex',flexDirection:'column'
          }}>
            <div style={{padding:'24px 32px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Próximos eventos</div>
              <button
                type="button"
                onClick={() => setActive('calendario')}
                style={{
                  fontSize:13,color:'var(--accent)',background:'transparent',
                  border:'none',cursor:'pointer',fontWeight:600,fontFamily:'inherit',padding:0
                }}
              >Ver calendario →</button>
            </div>
            <div style={{flex:1}}>
              {EVENTOS_UI.length === 0 && (
                <div style={{padding:'32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>
                  No hay eventos próximos.
                </div>
              )}
              {EVENTOS_UI.slice(0,4).map((e, i) => {
                const dt = new Date(e.fecha)
                const month = dt.toLocaleString('es', { month: 'short' }).replace('.','').toUpperCase()
                return (
                  <div key={e.id} style={{
                    minHeight:64,padding:'16px 32px',display:'flex',alignItems:'center',gap:16,
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)'
                  }}>
                    <div style={{
                      width:44,height:44,flexShrink:0,
                      background:'var(--accent-pill)',borderRadius:8,
                      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'
                    }}>
                      <span style={{fontSize:15,fontWeight:700,color:'var(--accent)',lineHeight:1}}>{dt.getDate()}</span>
                      <span style={{fontSize:9,fontWeight:700,color:'var(--accent)',marginTop:2,letterSpacing:'0.04em'}}>{month}</span>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{
                        fontSize:14,fontWeight:600,color:'var(--text-primary)',
                        whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'
                      }}>{e.titulo}</div>
                      <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>
                        {e.hora}{e.lugar ? ` · ${e.lugar}` : ''}
                      </div>
                    </div>
                    <span style={{
                      fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:999,
                      background:'var(--accent-pill)',color:'var(--accent)',whiteSpace:'nowrap',
                      letterSpacing:'0.02em'
                    }}>{e.tipo}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Cobros recientes */}
          <div style={{
            background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',
            boxShadow:'var(--card-shadow)',overflow:'hidden',display:'flex',flexDirection:'column'
          }}>
            <div style={{padding:'24px 32px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Cobros recientes</div>
              <button
                type="button"
                onClick={() => setActive('contabilidad')}
                style={{
                  fontSize:13,color:'var(--accent)',background:'transparent',
                  border:'none',cursor:'pointer',fontWeight:600,fontFamily:'inherit',padding:0
                }}
              >Gestionar pagos →</button>
            </div>
            <div style={{flex:1}}>
              {COBROS_UI.length === 0 && (
                <div style={{padding:'32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>
                  Sin facturas registradas.
                </div>
              )}
              {COBROS_UI.slice(0,5).map((c, i) => (
                <div key={c.id} style={{
                  minHeight:64,padding:'16px 32px',display:'flex',alignItems:'center',gap:16,
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)'
                }}>
                  <Avatar initials={c.socio.split(' ').map(w=>w[0]).join('').slice(0,2)} color={ACCENT_SOFT} size={36}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{
                      fontSize:14,fontWeight:600,color:'var(--text-primary)',
                      whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'
                    }}>{c.socio}</div>
                    <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{c.concepto}</div>
                  </div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',minWidth:80,textAlign:'right'}}>
                    {fmtMoney(c.monto)}
                  </div>
                  <Badge status={c.estado}/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SOCIOS ──────────────────────────────────────────────────────────────────
function Socios() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { bundle, reload, fmtMoney, showAlert, showConfirm } = useCrm();
  const role = normalizeRole(bundle?.user?.role)
  if (role !== 'ADMIN') return null
  const [sociosDb, setSociosDb] = useState<any[]>([])
  const SOCIOS_UI = sociosDb
  const EQUIPOS_UI = bundle?.equipos ?? [];
  const teamFilterId = (searchParams.get('team') ?? '').trim();
  const equipoFiltrado = teamFilterId
    ? EQUIPOS_UI.find((t) => t.id === teamFilterId)
    : null;
  const idsInFilteredTeam =
    equipoFiltrado && teamFilterId
      ? new Set((equipoFiltrado.miembros ?? []).map((m) => m.memberId))
      : null;
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('Todos');
  const [filterDeporte, setFilterDeporte] = useState('Todos');
  const [selected, setSelected] = useState(null);
  const [menuSocioId, setMenuSocioId] = useState<string | null>(null)
  const [menuSocioPos, setMenuSocioPos] = useState({ top: 0, right: 0 })
  const [showInscripcion, setShowInscripcion] = useState(false);
  const [inscripcionBusy, setInscripcionBusy] = useState(false);
  const [showEditSocioModal, setShowEditSocioModal] = useState(false);
  const [editSocioBusy, setEditSocioBusy] = useState(false);
  const [formEditSocio, setFormEditSocio] = useState({
    name: '',
    email: '',
    phone: '',
    dni: '',
    address: '',
    sportPreference: '',
  });
  const [formInscripcion, setFormInscripcion] = useState({
    nombre: '',
    apellidos: '',
    telefono: '',
    fechaNacimiento: '',
    dni: '',
    email: '',
    domicilio: '',
    deporte: '',
    fechaAlta: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    if (!selected) setShowEditSocioModal(false);
  }, [selected]);

  const loadSociosDb = useCallback(async () => {
    const r = await fetch('/api/crm/members', { credentials: 'include', cache: 'no-store' })
    if (!r.ok) throw new Error('No se pudo cargar la lista real de socios')
    const j = await r.json()
    setSociosDb(Array.isArray(j?.socios) ? j.socios : [])
  }, [])

  useEffect(() => {
    loadSociosDb().catch(() => {})
  }, [loadSociosDb])

  useEffect(() => {
    function closeMenu(e: MouseEvent) {
      const target = e.target
      if (!(target instanceof Element)) return
      if (!target.closest('[data-socio-menu]')) {
        setMenuSocioId(null)
      }
    }
    document.addEventListener('mousedown', closeMenu)
    return () => document.removeEventListener('mousedown', closeMenu)
  }, [])

  const filtered = SOCIOS_UI.filter(s => {
    if (teamFilterId) {
      if (!idsInFilteredTeam) return false;
      if (!idsInFilteredTeam.has(s.id)) return false;
    }
    return (
      (s.nombre.toLowerCase().includes(search.toLowerCase()) ||
        (s.email || '').toLowerCase().includes(search.toLowerCase())) &&
      (filterEstado === 'Todos' || s.estado === filterEstado) &&
      (filterDeporte === 'Todos' || s.deporte === filterDeporte)
    );
  });

  const deportes = ['Todos', ...new Set(SOCIOS_UI.map(s => s.deporte))];
  const estados = ['Todos', 'Activo', 'Moroso', 'Inactivo'];

  function abrirFormularioInscripcion() {
    setFormInscripcion({
      nombre: '',
      apellidos: '',
      telefono: '',
      fechaNacimiento: '',
      dni: '',
      email: '',
      domicilio: '',
      deporte: '',
      fechaAlta: new Date().toISOString().slice(0, 10),
    });
    setShowInscripcion(true);
  }

  async function enviarInscripcion(e) {
    e.preventDefault();
    if (!formInscripcion.nombre.trim() || !formInscripcion.apellidos.trim() || !formInscripcion.telefono.trim() || !formInscripcion.fechaNacimiento.trim()) {
      showAlert('Nombre, apellidos, teléfono y fecha de nacimiento son obligatorios.');
      return;
    }
    setInscripcionBusy(true);
    try {
      const r = await fetch('/api/crm/members', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formInscripcion.nombre.trim(),
          lastName: formInscripcion.apellidos.trim(),
          phone: formInscripcion.telefono.trim(),
          dni: formInscripcion.dni.trim() || undefined,
          email: formInscripcion.email.trim() || undefined,
          address: formInscripcion.domicilio.trim() || undefined,
          sportPreference: formInscripcion.deporte.trim() || undefined,
          birthDate: formInscripcion.fechaNacimiento || undefined,
          joinedAt: formInscripcion.fechaAlta || undefined,
        }),
      });
      if (!r.ok) {
        try {
          const j = await r.json();
          showAlert(j.error || 'Error al guardar');
        } catch {
          showAlert('No se pudo crear el socio');
        }
        return;
      }
      try {
        const j = await r.json()
        if (j?.memberAccount?.email) {
          showAlert(`Socio creado. Acceso portal: ${j.memberAccount.email} / ${j.memberAccount.defaultPassword}`)
        } else if (j?.warning) {
          showAlert(j.warning)
        }
      } catch {
        //
      }
      setShowInscripcion(false);
      await reload();
      await loadSociosDb()
    } finally {
      setInscripcionBusy(false);
    }
  }

  const insLabel = { fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, display: 'block', letterSpacing: 0.3 };
  const insInput = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#f1f5f9',
    fontFamily: 'inherit',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  function openEditSocioModal() {
    if (!selected) return;
    setFormEditSocio({
      name: selected.nombre || '',
      email: selected.email || '',
      phone: selected.telefono || '',
      dni: selected.dni || '',
      address: selected.domicilio || '',
      sportPreference: selected.deporteInscripcion || '',
    });
    setShowEditSocioModal(true);
  }

  async function enviarEdicionSocio(e) {
    e.preventDefault();
    if (!selected) return;
    const savedId = selected.id;
    const name = String(formEditSocio.name || '').trim();
    if (!name) return;
    setEditSocioBusy(true);
    try {
      const r = await fetch('/api/crm/members/' + savedId, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email: formEditSocio.email.trim() || undefined,
          phone: formEditSocio.phone.trim() || undefined,
          dni: formEditSocio.dni.trim() || undefined,
          address: formEditSocio.address.trim() || undefined,
          sportPreference: formEditSocio.sportPreference.trim() || undefined,
        }),
      });
      if (!r.ok) {
        let msg = 'No se pudo guardar';
        try {
          const j = await r.json();
          msg = j.error || msg;
        } catch {
          //
        }
        showAlert(msg);
        return;
      }
      setShowEditSocioModal(false);
      const j = await reload();
      await loadSociosDb()
      const nextSoc = j?.socios?.find((x) => x.id === savedId);
      if (nextSoc) setSelected(nextSoc);
    } finally {
      setEditSocioBusy(false);
    }
  }

  function toggleSocioMenu(e: React.MouseEvent<HTMLElement>, socio: any) {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const right = Math.max(12, window.innerWidth - r.right)
    setMenuSocioPos({ top: r.bottom + 6, right })
    setMenuSocioId((prev) => (prev === socio.id ? null : socio.id))
  }

  async function eliminarSocio(socio: any) {
    try {
      console.log('[eliminarSocio] click', socio?.id, socio?.nombre)
      setMenuSocioId(null)
      if (!socio?.id) {
        showAlert('Socio inválido (sin id).')
        return
      }
      let ok = false
      try {
        ok = await showConfirm(
          `¿Eliminar el socio "${socio.nombre}"? Esta acción no se puede deshacer.`,
        )
      } catch (err) {
        console.warn('[eliminarSocio] showConfirm falló, usando window.confirm', err)
        ok = typeof window !== 'undefined'
          ? window.confirm(`¿Eliminar el socio "${socio.nombre}"?`)
          : true
      }
      console.log('[eliminarSocio] confirmación', ok)
      if (!ok) return

      const url = '/api/crm/members/' + encodeURIComponent(socio.id)
      console.log('[eliminarSocio] DELETE ->', url)
      let r: Response
      try {
        r = await fetch(url, {
          method: 'DELETE',
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })
      } catch (netErr: any) {
        console.error('[eliminarSocio] error de red', netErr)
        showAlert(`Error de red al eliminar: ${netErr?.message || netErr}`)
        return
      }
      console.log('[eliminarSocio] status', r.status)

      if (!r.ok) {
        let msg = `No se pudo eliminar el socio (HTTP ${r.status})`
        try {
          const j = await r.json()
          if (j?.error) msg = j.error
        } catch {
          //
        }
        showAlert(msg)
        return
      }

      let result: any = null
      try {
        const j = await r.json()
        result = j?.result || null
      } catch {
        //
      }
      const deleted = Number(result?.memberDeleted || 0)
      console.log('[eliminarSocio] eliminado', { deleted, result })

      setSociosDb((prev) => prev.filter((x) => x.id !== socio.id))
      if (selected?.id === socio.id) setSelected(null)

      try { await reload() } catch (err) { console.warn('[eliminarSocio] reload error', err) }
      try { await loadSociosDb() } catch (err) { console.warn('[eliminarSocio] loadSociosDb error', err) }

      showAlert(
        deleted > 0
          ? `Socio "${socio.nombre}" eliminado de la base de datos.`
          : `El socio ya no existía en la base de datos. Lista actualizada.`,
      )
    } catch (err: any) {
      console.error('[eliminarSocio] excepción', err)
      showAlert(`Error inesperado al eliminar: ${err?.message || err}`)
    }
  }

  async function resetPortalAccess(socio: any) {
    if (!socio?.id) return
    const ok = await showConfirm(`¿Resetear acceso del portal para "${socio.nombre}"?`)
    if (!ok) return
    const r = await fetch('/api/crm/members/' + encodeURIComponent(socio.id) + '?action=reset-portal-access', {
      method: 'POST',
      credentials: 'include',
    })
    if (!r.ok) {
      try {
        const j = await r.json()
        showAlert(j.error || 'No se pudo resetear el acceso del portal')
      } catch {
        showAlert('No se pudo resetear el acceso del portal')
      }
      return
    }
    try {
      const j = await r.json()
      if (j?.access?.email) {
        showAlert(`Acceso portal actualizado: ${j.access.email} / ${j.access.defaultPassword}`)
      } else {
        showAlert('Acceso del portal actualizado.')
      }
    } catch {
      showAlert('Acceso del portal actualizado.')
    }
  }

  const editInput = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.09)',
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    color: '#111827',
    outline: 'none',
    boxSizing: 'border-box' as const,
  };
  const editLabel = {
    fontSize: 12,
    fontWeight: 600 as const,
    color: '#64748b',
    marginBottom: 6,
    display: 'block' as const,
    letterSpacing: 0.15,
  };

  async function registrarPagoSocio() {
    if (!selected?.pendingInvoiceId) {
      showAlert('No hay factura pendiente registrada para este socio.');
      return;
    }
    const r = await fetch('/api/crm/invoices/' + selected.pendingInvoiceId + '/mark-paid', { method: 'POST', credentials: 'include' });
    if (!r.ok) { showAlert('No se pudo registrar el pago'); return; }
    setSelected(null);
    await reload();
  }

  // KPIs Socios
  const totalSocios = SOCIOS_UI.length
  const sociosActivosN = SOCIOS_UI.filter(s => s.estado === 'Activo').length
  const sociosMorososN = SOCIOS_UI.filter(s => s.estado === 'Moroso').length
  const cuotaPromedio = totalSocios > 0
    ? SOCIOS_UI.reduce((a, s) => a + Number(s.cuota || 0), 0) / totalSocios
    : 0

  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--surface)'}}>
      <div style={{maxWidth:1440,margin:'0 auto',padding:'32px 40px 56px',display:'flex',flexDirection:'column',gap:32}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:24,flexWrap:'wrap'}}>
          <div>
            <h1 style={{fontSize:28,fontWeight:700,color:'var(--accent)',letterSpacing:'-0.02em',margin:0,lineHeight:1.1}}>Socios</h1>
            <p style={{color:'var(--text-secondary)',fontSize:14,marginTop:6,margin:0}}>
              {teamFilterId && equipoFiltrado
                ? `${filtered.length} de ${SOCIOS_UI.length} socios · equipo «${equipoFiltrado.nombre}»`
                : `${SOCIOS_UI.length} socios registrados en el club`}
            </p>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',alignItems:'flex-start',gap:10}}>
            <InviteLinkButton />
            <PaymentReminderButton />
            <button
              type="button"
              onClick={abrirFormularioInscripcion}
              style={{
                display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
                borderRadius:8,border:'none',cursor:'pointer',
                background:'var(--accent)',color:'#fff',
                fontFamily:'inherit',fontSize:13,fontWeight:700,
                boxShadow:'0 1px 2px rgba(0,74,198,0.2)',transition:'all 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
            >
              <Icon name="plus" size={15}/>Nuevo Socio
            </button>
          </div>
        </div>

        {/* KPI grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',gap:24}}>
          <KPICard
            label="Total socios"
            value={String(totalSocios)}
            sub={totalSocios > 0 ? 'En base de datos' : 'Sin socios todavía'}
            icon="users"
            color="var(--accent-soft)"
            badge={{ kind:'info', text:'Directorio' }}
          />
          <KPICard
            label="Socios activos"
            value={String(sociosActivosN)}
            sub={`${totalSocios > 0 ? Math.round((sociosActivosN / totalSocios) * 100) : 0}% del total`}
            icon="users"
            color="var(--green)"
            badge={{ kind:'success', text:'Al día' }}
          />
          <KPICard
            label="Morosos"
            value={String(sociosMorososN)}
            sub={sociosMorososN > 0 ? 'Requieren cobro' : 'Sin morosidad'}
            icon="billing"
            color="var(--red)"
            badge={sociosMorososN > 0 ? { kind:'danger', text:'Atención' } : { kind:'success', text:'OK' }}
          />
          <KPICard
            label="Cuota promedio"
            value={fmtMoney(cuotaPromedio)}
            sub="Cuota mensual media"
            icon="reports"
            color="var(--amber)"
          />
        </div>

        {/* Filters */}
        <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
          <div style={{position:'relative',flex:1,minWidth:200}}>
            <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}>
              <Icon name="search" size={16}/>
            </span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Buscar por nombre o correo electrónico…"
              style={{
                width:'100%',padding:'10px 12px 10px 38px',
                borderRadius:8,border:'1px solid var(--border)',
                fontFamily:'inherit',fontSize:14,background:'var(--surface-card)',
                outline:'none',color:'var(--text-primary)'
              }}/>
          </div>
          <div style={{display:'flex',gap:4,background:'var(--surface-low)',borderRadius:999,padding:4}}>
            {estados.map(e => (
              <button key={e} type="button" onClick={() => setFilterEstado(e)} style={{
                padding:'7px 14px',borderRadius:999,border:'none',cursor:'pointer',
                fontFamily:'inherit',fontSize:12,fontWeight:700,letterSpacing:'0.02em',
                background:filterEstado===e ? 'var(--surface-card)' : 'transparent',
                color:filterEstado===e ? 'var(--accent)' : 'var(--text-muted)',
                boxShadow: filterEstado===e ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                transition:'all 0.15s'
              }}>{e}</button>
            ))}
          </div>
          <select value={filterDeporte} onChange={e=>setFilterDeporte(e.target.value)} style={{
            padding:'9px 14px',borderRadius:8,border:'1px solid var(--border)',
            fontFamily:'inherit',fontSize:13,background:'var(--surface-card)',color:'var(--text-primary)',outline:'none',cursor:'pointer'
          }}>
            {deportes.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
      {teamFilterId && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '12px 16px',
            borderRadius: 12,
            background: equipoFiltrado ? 'var(--accent-light)' : '#fef3c7',
            border: `1px solid ${equipoFiltrado ? 'var(--accent)' : '#fcd34d'}`,
          }}
        >
          <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>
            {equipoFiltrado
              ? `Mostrando solo socios del equipo «${equipoFiltrado.nombre}».`
              : 'El equipo indicado en la URL no existe; no se muestran socios.'}
          </span>
          <button
            type="button"
            onClick={() =>
              router.replace('/?tab=socios', { scroll: false })
            }
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              border: 'none',
              background: '#111827',
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Ver todos los socios
          </button>
        </div>
      )}
      {/* Table card: Directorio de socios */}
      <div style={{background:'var(--surface-card)',borderRadius:12,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',overflow:'visible',position:'relative'}}>
        <div style={{padding:'24px 32px',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Directorio de socios</div>
          <div style={{fontSize:13,color:'var(--text-muted)',marginTop:4}}>
            {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'} en la vista actual
          </div>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:'var(--surface-low)'}}>
              {['Socio','DNI','Deporte','Categoría','Cuota','Vencimiento','Estado',''].map(h => (
                <th key={h} style={{
                  padding:'12px 32px',textAlign:'left',fontSize:11,
                  fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{padding:'32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>No hay socios que coincidan con los filtros.</td></tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} onClick={() => setSelected(s)} style={{
                borderTop:'1px solid var(--border)',cursor:'pointer',
                background:selected?.id===s.id ? 'var(--accent-pill)' : 'transparent',
                transition:'background 0.15s'
              }}
              onMouseEnter={(e) => { if (selected?.id !== s.id) e.currentTarget.style.background = 'var(--surface-low)' }}
              onMouseLeave={(e) => { if (selected?.id !== s.id) e.currentTarget.style.background = 'transparent' }}
              >
                <td style={{padding:'16px 32px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <Avatar initials={s.avatar} color="var(--accent-soft)" size={36}/>
                    <div>
                      <div style={{fontWeight:600,fontSize:14,color:'var(--text-primary)'}}>{s.nombre}</div>
                      <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{s.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{padding:'16px 32px',fontSize:13,color:'var(--text-secondary)'}}>{s.dni || '—'}</td>
                <td style={{padding:'16px 32px',fontSize:13,color:'var(--text-secondary)'}}>{s.deporte}</td>
                <td style={{padding:'16px 32px',fontSize:13,color:'var(--text-secondary)'}}>{s.categoria}</td>
                <td style={{padding:'16px 32px',fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>{fmtMoney(s.cuota)}</td>
                <td style={{padding:'16px 32px',fontSize:13,color:'var(--text-secondary)'}}>{new Date(s.vencimiento).toLocaleDateString('es-ES')}</td>
                <td style={{padding:'16px 32px'}}><Badge status={s.estado}/></td>
                <td style={{padding:'16px 32px'}}>
                  <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                    <button type="button" onClick={e=>{e.stopPropagation(); setSelected(s);}} style={{padding:7,borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',cursor:'pointer',color:'var(--text-muted)',transition:'all 0.15s'}} title="Ver y editar"
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                    ><Icon name="edit" size={14}/></button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation()
                        await eliminarSocio(s)
                      }}
                      style={{padding:7,borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',cursor:'pointer',color:'var(--red)',transition:'all 0.15s'}}
                      title="Eliminar socio"
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--red-light)'; e.currentTarget.style.borderColor = 'var(--red)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-card)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                    >
                      <Icon name="trash" size={14}/>
                    </button>
                    <button
                      type="button"
                      onClick={(e)=>toggleSocioMenu(e, s)}
                      data-socio-menu
                      style={{padding:7,borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',cursor:'pointer',color:'var(--text-muted)'}}
                    >
                      <Icon name="dots" size={14}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {menuSocioId && (
          <div
            data-socio-menu
            style={{
              position:'fixed',
              top: menuSocioPos.top,
              right: menuSocioPos.right,
              minWidth: 170,
              background:'#fff',
              border:'1px solid var(--border)',
              borderRadius:10,
              boxShadow:'0 14px 26px rgba(15,23,42,0.16)',
              zIndex:1200,
              overflow:'hidden',
            }}
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const socio = SOCIOS_UI.find((x) => x.id === menuSocioId)
                if (!socio) return
                setSelected(socio)
                setMenuSocioId(null)
                openEditSocioModal()
              }}
              style={{
                width:'100%',textAlign:'left',padding:'10px 12px',border:'none',borderBottom:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,color:'#374151',fontWeight:600
              }}
            >
              Editar socio
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const socio = SOCIOS_UI.find((x) => x.id === menuSocioId)
                if (!socio) return
                eliminarSocio(socio)
              }}
              style={{
                width:'100%',textAlign:'left',padding:'10px 12px',border:'none',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,color:'#b91c1c',fontWeight:700
              }}
            >
              Eliminar socio
            </button>
          </div>
        )}
      </div>
      {selected && (
        <div style={{
          position:'fixed',top:0,right:0,bottom:0,width:360,
          background:'#fff',boxShadow:'-4px 0 30px rgba(0,0,0,0.12)',
          zIndex:100,padding:28,overflowY:'auto',display:'flex',flexDirection:'column',gap:20
        }}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontWeight:700,fontSize:16,color:'#111827'}}>Perfil del Socio</div>
            <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280'}}><Icon name="x" size={18}/></button>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'16px 0',borderBottom:'1px solid var(--border)'}}>
            <Avatar initials={selected.avatar} color="#3B82F6" size={64}/>
            <div style={{fontWeight:700,fontSize:18,color:'#111827'}}>{selected.nombre}</div>
            <div style={{fontSize:13,color:'#6b7280'}}>{selected.email}</div>
            <Badge status={selected.estado}/>
          </div>
          {[
            ['DNI', selected.dni || '—'],
            ['Domicilio', selected.domicilio || '—'],
            ['Deporte (inscripción)', selected.deporteInscripcion || '—'],
            ['Equipo asignado', selected.equipoNombre || '—'],
            ['Fecha de alta', selected.fechaAlta ? new Date(selected.fechaAlta).toLocaleDateString('es-AR') : '—'],
            ['Deporte', selected.deporte],
            ['Categoría', selected.categoria],
            ['Cuota mensual', fmtMoney(selected.cuota)],
            ['Próximo vencimiento', new Date(selected.vencimiento).toLocaleDateString('es-AR')],
            ['Factura pendiente', selected.pendingInvoiceId ? fmtMoney(selected.pendingInvoiceAmount || 0) : 'Ninguna'],
          ].map(([k, v], idx) => (
            <div key={idx + String(k)} style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:13,color:'#6b7280'}}>{k}</span>
              <span style={{fontSize:13,fontWeight:600,color:'#111827'}}>{v}</span>
            </div>
          ))}
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button type="button" onClick={openEditSocioModal} style={{flex:1,padding:'10px',borderRadius:12,border:'1.5px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:600,color:'#374151'}}>Editar datos</button>
            <button type="button" onClick={registrarPagoSocio} style={{flex:1,padding:'10px',borderRadius:12,border:'none',background:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:600,color:'#fff'}}>Registrar Pago</button>
          </div>
          <button
            type="button"
            onClick={() => resetPortalAccess(selected)}
            style={{
              width:'100%',
              padding:'10px',
              borderRadius:12,
              border:'1px solid var(--border)',
              background:'#fff',
              cursor:'pointer',
              fontFamily:'inherit',
              fontSize:13,
              fontWeight:600,
              color:'#374151'
            }}
          >
            Resetear acceso portal
          </button>
          <button
            type="button"
            onClick={() => eliminarSocio(selected)}
            style={{
              width:'100%',
              padding:'10px',
              borderRadius:12,
              border:'1px solid #fecaca',
              background:'#fff',
              cursor:'pointer',
              fontFamily:'inherit',
              fontSize:13,
              fontWeight:700,
              color:'#b91c1c'
            }}
          >
            Eliminar socio
          </button>
        </div>
      )}
      {showEditSocioModal && selected && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 400,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget || editSocioBusy) return;
            setShowEditSocioModal(false);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-socio-title"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={enviarEdicionSocio}
            style={{
              width: '100%',
              maxWidth: 440,
              maxHeight: '92vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 16,
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.28), 0 0 1px rgba(0,0,0,0.08)',
              padding: 28,
              fontFamily: 'inherit',
            }}
          >
            <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <h2 id="edit-socio-title" style={{ margin: '0 0 6px 0', fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.4px' }}>
                  Editar datos del socio
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                  Los cambios se guardan en el perfil del club.
                </p>
              </div>
              <button
                type="button"
                disabled={editSocioBusy}
                onClick={() => setShowEditSocioModal(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  cursor: editSocioBusy ? 'not-allowed' : 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                aria-label="Cerrar"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={editLabel}>Nombre completo *</label>
                <input
                  required
                  value={formEditSocio.name}
                  onChange={(e) => setFormEditSocio((p) => ({ ...p, name: e.target.value }))}
                  style={editInput}
                  autoComplete="name"
                />
              </div>
              <div>
                <label style={editLabel}>Correo electrónico</label>
                <input
                  type="email"
                  value={formEditSocio.email}
                  onChange={(e) => setFormEditSocio((p) => ({ ...p, email: e.target.value }))}
                  style={editInput}
                  autoComplete="email"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="min-w-0">
                  <label style={editLabel}>Teléfono</label>
                  <input
                    value={formEditSocio.phone}
                    onChange={(e) => setFormEditSocio((p) => ({ ...p, phone: e.target.value }))}
                    style={editInput}
                    autoComplete="tel"
                  />
                </div>
                <div className="min-w-0">
                  <label style={editLabel}>DNI</label>
                  <input
                    value={formEditSocio.dni}
                    onChange={(e) => setFormEditSocio((p) => ({ ...p, dni: e.target.value }))}
                    style={editInput}
                  />
                </div>
              </div>
              <div>
                <label style={editLabel}>Domicilio</label>
                <input
                  value={formEditSocio.address}
                  onChange={(e) => setFormEditSocio((p) => ({ ...p, address: e.target.value }))}
                  style={editInput}
                  autoComplete="street-address"
                />
              </div>
              <div>
                <label style={editLabel}>Deporte (inscripción)</label>
                <input
                  value={formEditSocio.sportPreference}
                  onChange={(e) => setFormEditSocio((p) => ({ ...p, sportPreference: e.target.value }))}
                  style={editInput}
                  placeholder="Ej. Voleibol playa"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 26 }}>
              <button
                type="button"
                disabled={editSocioBusy}
                onClick={() => setShowEditSocioModal(false)}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: '1.5px solid rgba(0,0,0,0.09)',
                  background: '#fff',
                  cursor: editSocioBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#374151',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={editSocioBusy}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--accent)',
                  cursor: editSocioBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  opacity: editSocioBusy ? 0.75 : 1,
                }}
              >
                {editSocioBusy ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}
      {showInscripcion && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            background: 'rgba(15,23,42,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => !inscripcionBusy && setShowInscripcion(false)}
        >
          <form
            onSubmit={enviarInscripcion}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#111827',
              border: '1px solid #334155',
              borderRadius: 16,
              padding: 28,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ marginBottom: 22 }}>
              <h2 style={{ margin: '0 0 6px 0', fontSize: 20, fontWeight: 800, color: '#f8fafc', letterSpacing: -0.3 }}>
                Inscripción de socio
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                Completa los datos aquí mismo (sin pop-ups del navegador).
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={insLabel}>Nombre *</label>
                <input
                  required
                  value={formInscripcion.nombre}
                  onChange={(e) => setFormInscripcion((p) => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej. María"
                  style={insInput}
                  autoComplete="given-name"
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={insLabel}>Apellidos *</label>
                <input
                  required
                  value={formInscripcion.apellidos}
                  onChange={(e) => setFormInscripcion((p) => ({ ...p, apellidos: e.target.value }))}
                  placeholder="Ej. García López"
                  style={insInput}
                  autoComplete="family-name"
                />
              </div>
              <div>
                <label style={insLabel}>Fecha de nacimiento *</label>
                <input
                  type="date"
                  required
                  value={formInscripcion.fechaNacimiento}
                  onChange={(e) => setFormInscripcion((p) => ({ ...p, fechaNacimiento: e.target.value }))}
                  style={insInput}
                />
              </div>
              <div>
                <label style={insLabel}>DNI</label>
                <input
                  value={formInscripcion.dni}
                  onChange={(e) => setFormInscripcion((p) => ({ ...p, dni: e.target.value }))}
                  placeholder="12345678A"
                  style={insInput}
                />
              </div>
              <div>
                <label style={insLabel}>Fecha de alta</label>
                <input
                  type="date"
                  value={formInscripcion.fechaAlta}
                  onChange={(e) => setFormInscripcion((p) => ({ ...p, fechaAlta: e.target.value }))}
                  style={insInput}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={insLabel}>Teléfono *</label>
                <input
                  required
                  value={formInscripcion.telefono}
                  onChange={(e) => setFormInscripcion((p) => ({ ...p, telefono: e.target.value }))}
                  placeholder="Ej. +34 666 777 888"
                  style={insInput}
                  autoComplete="tel"
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={insLabel}>Correo electrónico</label>
                <input
                  type="email"
                  value={formInscripcion.email}
                  onChange={(e) => setFormInscripcion((p) => ({ ...p, email: e.target.value }))}
                  placeholder="nombre@ejemplo.com"
                  style={insInput}
                  autoComplete="email"
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={insLabel}>Domicilio</label>
                <input
                  value={formInscripcion.domicilio}
                  onChange={(e) => setFormInscripcion((p) => ({ ...p, domicilio: e.target.value }))}
                  placeholder="Calle, número, localidad…"
                  style={insInput}
                  autoComplete="street-address"
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={insLabel}>Deporte a inscribirse</label>
                <input
                  value={formInscripcion.deporte}
                  onChange={(e) => setFormInscripcion((p) => ({ ...p, deporte: e.target.value }))}
                  placeholder="Ej. Voleibol, multideporte…"
                  style={insInput}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                disabled={inscripcionBusy}
                onClick={() => setShowInscripcion(false)}
                style={{
                  padding: '11px 20px',
                  borderRadius: 10,
                  border: '1px solid #475569',
                  background: 'transparent',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={inscripcionBusy}
                style={{
                  padding: '11px 22px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg,#6366f1,#a78bfa)',
                  color: '#fff',
                  cursor: inscripcionBusy ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: 14,
                  opacity: inscripcionBusy ? 0.8 : 1,
                }}
              >
                {inscripcionBusy ? 'Guardando…' : 'Guardar inscripción'}
              </button>
            </div>
          </form>
        </div>
      )}
      </div>
    </div>
  );
}

// ── EQUIPOS ─────────────────────────────────────────────────────────────────
function Equipos() {
  const router = useRouter()
  const { bundle, reload, showAlert } = useCrm();
  const role = normalizeRole(bundle?.user?.role)
  if (!(role === 'ADMIN' || role === 'COACH')) return null
  const EQUIPOS_UI = bundle?.equipos ?? [];
  const [view, setView] = useState('grid');
  const [showNuevoEquipoModal, setShowNuevoEquipoModal] = useState(false);
  const [nuevoEquipoBusy, setNuevoEquipoBusy] = useState(false);
  const [formNuevoEquipo, setFormNuevoEquipo] = useState({ name: '', category: '' });

  const teamInput = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.09)',
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    color: '#111827',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const teamLabel = {
    fontSize: 12,
    fontWeight: 600,
    color: '#64748b',
    marginBottom: 6,
    display: 'block',
    letterSpacing: 0.15,
  };

  function openNuevoEquipoModal() {
    setFormNuevoEquipo({ name: '', category: '' });
    setShowNuevoEquipoModal(true);
  }

  async function enviarNuevoEquipo(e) {
    e.preventDefault();
    const name = String(formNuevoEquipo.name || '').trim();
    if (!name) return;
    setNuevoEquipoBusy(true);
    try {
      const r = await fetch('/api/crm/teams', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category: formNuevoEquipo.category.trim() || undefined,
        }),
      });
      if (!r.ok) {
        let msg = 'No se pudo crear el equipo';
        try {
          const j = await r.json();
          msg = j.error || msg;
        } catch {
          //
        }
        showAlert(msg);
        return;
      }
      setShowNuevoEquipoModal(false);
      await reload();
    } finally {
      setNuevoEquipoBusy(false);
    }
  }

  const SOCIOS_ALL = bundle?.socios ?? [];
  const [gestionarEquipo, setGestionarEquipo] = useState(null);
  const [gestionarBusy, setGestionarBusy] = useState(false);
  const [formGestionarTeam, setFormGestionarTeam] = useState({ nombre: '', categoria: '' });
  const [coachSelectMemberId, setCoachSelectMemberId] = useState('');
  const [addAlEquipoMemberId, setAddAlEquipoMemberId] = useState('');
  const [scheduleForm, setScheduleForm] = useState({
    weekday: '1',
    startTime: '18:00',
    durationMinutes: '90',
    location: '',
    title: '',
  });

  const WEEKDAY_OPTIONS = [
    { value: 0, label: 'Domingo' },
    { value: 1, label: 'Lunes' },
    { value: 2, label: 'Martes' },
    { value: 3, label: 'Miércoles' },
    { value: 4, label: 'Jueves' },
    { value: 5, label: 'Viernes' },
    { value: 6, label: 'Sábado' },
  ];

  function openGestionar(eq) {
    setGestionarEquipo(eq);
    setFormGestionarTeam({
      nombre: eq.nombre || '',
      categoria: eq.categoriaDb !== undefined ? eq.categoriaDb : '',
    });
    setCoachSelectMemberId(eq.coachMemberId || '');
    setAddAlEquipoMemberId('');
    setScheduleForm({
      weekday: '1',
      startTime: '18:00',
      durationMinutes: '90',
      location: '',
      title: '',
    });
  }

  async function anadirHorarioEquipo() {
    if (!gestionarEquipo) return;
    setGestionarBusy(true);
    try {
      const r = await fetch('/api/crm/teams/' + gestionarEquipo.id + '/schedules', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekday: Number(scheduleForm.weekday),
          startTime: scheduleForm.startTime,
          durationMinutes: Number(scheduleForm.durationMinutes) || 90,
          location: scheduleForm.location.trim() || null,
          title: scheduleForm.title.trim() || null,
        }),
      });
      if (!r.ok) {
        try {
          showAlert((await r.json()).error || 'Error al guardar horario');
        } catch {
          showAlert('Error al guardar horario');
        }
        return;
      }
      const j = await reload();
      const next = j?.equipos?.find((x) => x.id === gestionarEquipo.id);
      if (next) setGestionarEquipo(next);
    } finally {
      setGestionarBusy(false);
    }
  }

  async function quitarHorarioEquipo(scheduleId) {
    if (!gestionarEquipo) return;
    setGestionarBusy(true);
    try {
      const r = await fetch(
        '/api/crm/teams/' + gestionarEquipo.id + '/schedules/' + scheduleId,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!r.ok) {
        showAlert('No se pudo quitar el horario');
        return;
      }
      const j = await reload();
      const next = j?.equipos?.find((x) => x.id === gestionarEquipo.id);
      if (next) setGestionarEquipo(next);
    } finally {
      setGestionarBusy(false);
    }
  }

  function closeGestionar() {
    if (gestionarBusy) return;
    setGestionarEquipo(null);
  }

  async function guardarDatosEquipo(e) {
    e.preventDefault();
    if (!gestionarEquipo) return;
    const nombre = formGestionarTeam.nombre.trim();
    if (!nombre) return;
    setGestionarBusy(true);
    try {
      const r = await fetch('/api/crm/teams/' + gestionarEquipo.id, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nombre,
          category: formGestionarTeam.categoria.trim() ? formGestionarTeam.categoria.trim() : null,
        }),
      });
      if (!r.ok) {
        let msg = 'No se pudieron guardar los datos';
        try {
          const j = await r.json();
          msg = j.error || msg;
        } catch {
          //
        }
        showAlert(msg);
        return;
      }
      const j = await reload();
      const next = j?.equipos?.find((x) => x.id === gestionarEquipo.id);
      if (next) {
        setGestionarEquipo(next);
        setFormGestionarTeam({
          nombre: next.nombre,
          categoria: next.categoriaDb !== undefined ? next.categoriaDb : '',
        });
        setCoachSelectMemberId(next.coachMemberId || '');
      }
    } finally {
      setGestionarBusy(false);
    }
  }

  async function aplicarEntrenador() {
    if (!gestionarEquipo || !coachSelectMemberId) {
      showAlert('Elige un socio como entrenador.');
      return;
    }
    setGestionarBusy(true);
    try {
      const r = await fetch('/api/crm/teams/' + gestionarEquipo.id + '/coach', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: coachSelectMemberId }),
      });
      if (!r.ok) {
        try {
          showAlert((await r.json()).error || 'Error');
        } catch {
          showAlert('Error');
        }
        return;
      }
      const j = await reload();
      const next = j?.equipos?.find((x) => x.id === gestionarEquipo.id);
      if (next) {
        setGestionarEquipo(next);
        setCoachSelectMemberId(next.coachMemberId || '');
      }
    } finally {
      setGestionarBusy(false);
    }
  }

  async function quitarDelEquipo(teamMemberId) {
    if (!gestionarEquipo) return;
    setGestionarBusy(true);
    try {
      const r = await fetch('/api/crm/team-members/' + teamMemberId, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) {
        showAlert('No se pudo quitar del equipo');
        return;
      }
      const j = await reload();
      const next = j?.equipos?.find((x) => x.id === gestionarEquipo.id);
      if (next) {
        setGestionarEquipo(next);
        setCoachSelectMemberId(next.coachMemberId || '');
      } else {
        setGestionarEquipo(null);
      }
    } finally {
      setGestionarBusy(false);
    }
  }

  async function anadirSocioAlEquipo() {
    if (!gestionarEquipo || !addAlEquipoMemberId) return;
    setGestionarBusy(true);
    try {
      const r = await fetch('/api/crm/teams/' + gestionarEquipo.id + '/members', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: addAlEquipoMemberId, role: 'PLAYER' }),
      });
      if (!r.ok) {
        try {
          showAlert((await r.json()).error || 'Error');
        } catch {
          showAlert('Error');
        }
        return;
      }
      setAddAlEquipoMemberId('');
      const j = await reload();
      const next = j?.equipos?.find((x) => x.id === gestionarEquipo.id);
      if (next) setGestionarEquipo(next);
    } finally {
      setGestionarBusy(false);
    }
  }

  const sociosDisponiblesParaEquipo = gestionarEquipo
    ? SOCIOS_ALL.filter(
        (s) => !(gestionarEquipo.miembros ?? []).some((m) => m.memberId === s.id),
      )
    : [];

  // KPIs Equipos
  const totalEquipos = EQUIPOS_UI.length
  const totalJugadores = EQUIPOS_UI.reduce((a, e) => a + Number(e.jugadores || 0), 0)
  const sinCoach = EQUIPOS_UI.filter(e => !e.coachMemberId).length
  const categoriasUnicas = new Set(EQUIPOS_UI.map(e => e.categoria).filter(Boolean)).size

  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--surface)'}}>
      <div style={{maxWidth:1440,margin:'0 auto',padding:'32px 40px 56px',display:'flex',flexDirection:'column',gap:32}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:24,flexWrap:'wrap'}}>
          <div>
            <h1 style={{fontSize:28,fontWeight:700,color:'var(--accent)',letterSpacing:'-0.02em',margin:0,lineHeight:1.1}}>Equipos</h1>
            <p style={{color:'var(--text-secondary)',fontSize:14,marginTop:6,margin:0}}>{EQUIPOS_UI.length} equipos activos en el club</p>
          </div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
            <div style={{display:'flex',gap:4,background:'var(--surface-low)',borderRadius:8,padding:4}}>
              {[['grid','⊞'],['list','☰']].map(([v,icon])=>(
                <button key={v} type="button" onClick={()=>setView(v)} style={{
                  padding:'6px 12px',border:'none',cursor:'pointer',borderRadius:6,
                  background:view===v?'var(--surface-card)':'transparent',
                  color:view===v?'var(--accent)':'var(--text-muted)',
                  fontFamily:'inherit',fontSize:14,fontWeight:700,
                  boxShadow: view===v ? '0 1px 2px rgba(0,0,0,0.04)' : 'none'
                }}>{icon}</button>
              ))}
            </div>
            <button
              type="button"
              onClick={openNuevoEquipoModal}
              style={{
                display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
                borderRadius:8,border:'none',cursor:'pointer',
                background:'var(--accent)',color:'#fff',
                fontFamily:'inherit',fontSize:13,fontWeight:700,
                boxShadow:'0 1px 2px rgba(0,74,198,0.2)',transition:'all 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
            >
              <Icon name="plus" size={15}/>Nuevo Equipo
            </button>
          </div>
        </div>

        {/* KPI grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',gap:24}}>
          <KPICard label="Total equipos" value={String(totalEquipos)} sub="Plantillas registradas" icon="teams" color="var(--accent-soft)" badge={{ kind:'info', text:'Plantillas' }}/>
          <KPICard label="Jugadores" value={String(totalJugadores)} sub="En todas las categorías" icon="users" color="var(--green)" badge={{ kind:'success', text:'Activos' }}/>
          <KPICard label="Categorías" value={String(categoriasUnicas)} sub="Senior, juvenil, etc." icon="dashboard" color="var(--amber)"/>
          <KPICard label="Sin entrenador" value={String(sinCoach)} sub={sinCoach > 0 ? 'Asignar coach' : 'Todos cubiertos'} icon="users" color="var(--red)" badge={sinCoach > 0 ? { kind:'warning', text:'Pendiente' } : { kind:'success', text:'OK' }}/>
        </div>

        {/* Grid de equipos */}
        <div style={{
          background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',
          boxShadow:'var(--card-shadow)',padding:32
        }}>
          <div style={{marginBottom:20}}>
            <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Plantillas del club</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginTop:4}}>Gestiona socios, entrenador y horarios de cada equipo.</div>
          </div>
          {EQUIPOS_UI.length === 0 ? (
            <div style={{padding:'32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>
              Todavía no hay equipos. Crea el primero con «Nuevo Equipo».
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:16,width:'100%'}}>
              {EQUIPOS_UI.map(eq => (
                <div key={eq.id} style={{
                  background:'var(--surface-card)',borderRadius:12,padding:20,
                  border:'1px solid var(--border)',
                  cursor:'default',transition:'all 0.15s',
                  display:'flex',flexDirection:'column',gap:14
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = 'var(--card-shadow-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
                      <div style={{
                        width:44,height:44,borderRadius:12,flexShrink:0,
                        background:`${eq.color}15`,
                        display:'flex',alignItems:'center',justifyContent:'center',
                        fontSize:20
                      }}>{eq.logo}</div>
                      <div style={{minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:15,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{eq.nombre}</div>
                        <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{eq.deporte} · {eq.categoria}</div>
                      </div>
                    </div>
                    <span style={{
                      fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:999,flexShrink:0,
                      background:`${eq.color}15`,color:eq.color,whiteSpace:'nowrap',letterSpacing:'0.02em'
                    }}>{eq.jugadores}</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:10,borderTop:'1px solid var(--border)',paddingTop:14}}>
                    <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
                      <span style={{fontSize:12,color:'var(--text-muted)',flexShrink:0}}>Entrenador</span>
                      <span style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'right'}}>{eq.entrenador}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
                      <span style={{fontSize:12,color:'var(--text-muted)',flexShrink:0}}>Horario</span>
                      <span style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'right'}}>{eq.horario}</span>
                    </div>
                  </div>
                  <div style={{marginTop:'auto',display:'flex',flexWrap:'wrap',gap:8}}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); openGestionar(eq); }} style={{flex:1,minWidth:88,padding:'9px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,color:'var(--text-primary)',transition:'all 0.15s'}}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-low)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-card)' }}
                    >Gestionar</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); router.replace(`/?tab=socios&team=${encodeURIComponent(eq.id)}`, { scroll: false }); }} style={{flex:1,minWidth:88,padding:'9px',borderRadius:8,border:'none',background:'var(--accent-pill)',color:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700}}>Ver socios</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      {showNuevoEquipoModal && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 400,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget || nuevoEquipoBusy) return;
            setShowNuevoEquipoModal(false);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="nuevo-equipo-title"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={enviarNuevoEquipo}
            style={{
              width: '100%',
              maxWidth: 440,
              maxHeight: '92vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 16,
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.28), 0 0 1px rgba(0,0,0,0.08)',
              padding: 28,
              fontFamily: 'inherit',
            }}
          >
            <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <h2 id="nuevo-equipo-title" style={{ margin: '0 0 6px 0', fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.4px' }}>
                  Nuevo equipo
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                  Asigna un nombre y, si quieres, una categoría deportiva.
                </p>
              </div>
              <button
                type="button"
                disabled={nuevoEquipoBusy}
                onClick={() => setShowNuevoEquipoModal(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  cursor: nuevoEquipoBusy ? 'not-allowed' : 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                aria-label="Cerrar"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={teamLabel}>Nombre del equipo *</label>
                <input
                  required
                  autoFocus
                  value={formNuevoEquipo.name}
                  onChange={(e) => setFormNuevoEquipo((p) => ({ ...p, name: e.target.value }))}
                  style={teamInput}
                  placeholder="Ej. Juveniles A"
                />
              </div>
              <div>
                <label style={teamLabel}>Categoría (opcional)</label>
                <input
                  value={formNuevoEquipo.category}
                  onChange={(e) => setFormNuevoEquipo((p) => ({ ...p, category: e.target.value }))}
                  style={teamInput}
                  placeholder="Ej. Sub-18, Primera regional…"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 26 }}>
              <button
                type="button"
                disabled={nuevoEquipoBusy}
                onClick={() => setShowNuevoEquipoModal(false)}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: '1.5px solid rgba(0,0,0,0.09)',
                  background: '#fff',
                  cursor: nuevoEquipoBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#374151',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={nuevoEquipoBusy}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--accent)',
                  cursor: nuevoEquipoBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  opacity: nuevoEquipoBusy ? 0.75 : 1,
                }}
              >
                {nuevoEquipoBusy ? 'Creando…' : 'Crear equipo'}
              </button>
            </div>
          </form>
        </div>
      )}
      {gestionarEquipo && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 410,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget || gestionarBusy) return;
            closeGestionar();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gestionar-equipo-title"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '92vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 16,
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.28), 0 0 1px rgba(0,0,0,0.08)',
              padding: 28,
              fontFamily: 'inherit',
            }}
          >
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <h2 id="gestionar-equipo-title" style={{ margin: '0 0 6px 0', fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.4px' }}>
                  Gestionar equipo
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                  Nombre, categoría, entrenador y plantilla.
                </p>
              </div>
              <button
                type="button"
                disabled={gestionarBusy}
                onClick={closeGestionar}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  cursor: gestionarBusy ? 'not-allowed' : 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                aria-label="Cerrar"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={guardarDatosEquipo} style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={teamLabel}>Nombre del equipo *</label>
                  <input
                    required
                    value={formGestionarTeam.nombre}
                    onChange={(e) => setFormGestionarTeam((p) => ({ ...p, nombre: e.target.value }))}
                    style={teamInput}
                  />
                </div>
                <div>
                  <label style={teamLabel}>Categoría</label>
                  <input
                    value={formGestionarTeam.categoria}
                    onChange={(e) => setFormGestionarTeam((p) => ({ ...p, categoria: e.target.value }))}
                    style={teamInput}
                    placeholder="Ej. Sub-18"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={gestionarBusy}
                style={{
                  marginTop: 16,
                  width: '100%',
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--accent)',
                  cursor: gestionarBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  opacity: gestionarBusy ? 0.75 : 1,
                }}
              >
                {gestionarBusy ? 'Guardando…' : 'Guardar datos del equipo'}
              </button>
            </form>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Entrenador</div>
              <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#6b7280' }}>
                Debe ser un socio del club (si no está en el equipo, se añadirá automáticamente).
              </p>
              <select
                value={coachSelectMemberId}
                onChange={(e) => setCoachSelectMemberId(e.target.value)}
                style={{ ...teamInput, cursor: 'pointer', marginBottom: 10 }}
              >
                <option value="">— Elige un socio —</option>
                {SOCIOS_ALL.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                    {s.email ? ` (${s.email})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={gestionarBusy || !coachSelectMemberId}
                onClick={aplicarEntrenador}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: '#f8fafc',
                  cursor: gestionarBusy || !coachSelectMemberId ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#334155',
                }}
              >
                Asignar como entrenador
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Horarios fijos</div>
              <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#6b7280' }}>Usados en avisos al tutor (WD-1).</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {(gestionarEquipo.horarios ?? []).length === 0 && (
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>Sin horarios definidos.</div>
                )}
                {(gestionarEquipo.horarios ?? []).map((h) => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: '#fafafa' }}>
                    <div style={{ fontSize: 13, color: '#111827' }}>
                      <strong>{WEEKDAY_OPTIONS.find((d) => d.value === h.weekday)?.label ?? `Día ${h.weekday}`}</strong>
                      {' · '}{h.startTime}{h.location ? ` · ${h.location}` : ''}
                    </div>
                    <button type="button" disabled={gestionarBusy} onClick={() => quitarHorarioEquipo(h.id)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', cursor: gestionarBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>Quitar</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 10 }}>
                <select value={scheduleForm.weekday} onChange={(e) => setScheduleForm((f) => ({ ...f, weekday: e.target.value }))} style={{ ...teamInput, cursor: 'pointer' }}>
                  {WEEKDAY_OPTIONS.map((d) => (<option key={d.value} value={String(d.value)}>{d.label}</option>))}
                </select>
                <input type="time" value={scheduleForm.startTime} onChange={(e) => setScheduleForm((f) => ({ ...f, startTime: e.target.value }))} style={teamInput} />
                <input type="number" min={30} max={240} step={15} value={scheduleForm.durationMinutes} onChange={(e) => setScheduleForm((f) => ({ ...f, durationMinutes: e.target.value }))} style={teamInput} placeholder="Min" title="Duración (min)" />
                <input value={scheduleForm.location} onChange={(e) => setScheduleForm((f) => ({ ...f, location: e.target.value }))} style={teamInput} placeholder="Ubicación" />
              </div>
              <button type="button" disabled={gestionarBusy} onClick={anadirHorarioEquipo} style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)', background: '#f8fafc', cursor: gestionarBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 20 }}>Añadir horario</button>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Socios en el equipo</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {(gestionarEquipo.miembros ?? []).length === 0 && (
                  <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>Nadie asignado todavía.</div>
                )}
                {(gestionarEquipo.miembros ?? []).map((m) => (
                  <div
                    key={m.teamMemberId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: '#fafafa',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{m.nombre}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: m.role === 'COACH' ? 'var(--accent)' : '#64748b', marginTop: 2 }}>
                        {m.role === 'COACH' ? 'Entrenador' : 'Jugador'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={gestionarBusy}
                      onClick={() => quitarDelEquipo(m.teamMemberId)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid #fecaca',
                        background: '#fff',
                        color: '#b91c1c',
                        cursor: gestionarBusy ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 12,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Añadir socio al equipo</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
                <select
                  value={addAlEquipoMemberId}
                  onChange={(e) => setAddAlEquipoMemberId(e.target.value)}
                  style={{ ...teamInput, flex: 1, minWidth: 200, cursor: 'pointer' }}
                >
                  <option value="">— Elige socio para añadir —</option>
                  {sociosDisponiblesParaEquipo.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={gestionarBusy || !addAlEquipoMemberId || sociosDisponiblesParaEquipo.length === 0}
                  onClick={anadirSocioAlEquipo}
                  style={{
                    padding: '11px 18px',
                    borderRadius: 12,
                    border: 'none',
                    background: sociosDisponiblesParaEquipo.length && addAlEquipoMemberId ? '#111827' : '#e5e7eb',
                    color: sociosDisponiblesParaEquipo.length && addAlEquipoMemberId ? '#fff' : '#9ca3af',
                    cursor: gestionarBusy || !addAlEquipoMemberId ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Añadir
                </button>
              </div>
              {sociosDisponiblesParaEquipo.length === 0 && (gestionarEquipo.miembros ?? []).length > 0 && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: '#9ca3af' }}>Todos los socios ya están en este equipo.</p>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ── COBROS ──────────────────────────────────────────────────────────────────
function Contabilidad({ setActive }) {
  const { bundle, reload, fmtMoney, showAlert, showConfirm } = useCrm();
  const role = normalizeRole(bundle?.user?.role)
  if (!(role === 'ADMIN' || role === 'TREASURER')) return null
  const COBROS_UI = bundle?.cobros ?? [];
  const SOCIOS_UI = bundle?.socios ?? [];
  const [contaTab, setContaTab] = useState('COBROS');
  const [tab, setTab] = useState('Todos');
  const [tesoreriaRange, setTesoreriaRange] = useState<'semestre' | 'anual'>('semestre');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [menuCobroId, setMenuCobroId] = useState<string | null>(null);
  const [menuCobroPos, setMenuCobroPos] = useState({ top: 0, right: 0 });
  const [downloadingCobroId, setDownloadingCobroId] = useState<string | null>(null);
  const [deletingCobroId, setDeletingCobroId] = useState<string | null>(null);
  const [showNuevoCobroModal, setShowNuevoCobroModal] = useState(false);
  const [showMovimientoModal, setShowMovimientoModal] = useState(false);
  const [movimientoType, setMovimientoType] = useState<'INCOME' | 'EXPENSE'>('INCOME');
  const [nuevoCobroBusy, setNuevoCobroBusy] = useState(false);
  const [movimientoBusy, setMovimientoBusy] = useState(false);
  const [deletingMovementId, setDeletingMovementId] = useState<string | null>(null);
  const [taxBusy, setTaxBusy] = useState(false);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [ledgerData, setLedgerData] = useState<{
    entries: any[]
    accounts: any[]
    periods: any[]
    reports: any | null
  }>({ entries: [], accounts: [], periods: [], reports: null });
  const [nuevoCobroForm, setNuevoCobroForm] = useState({
    memberId: '',
    concepto: '',
    amount: '',
    dueDate: '',
    applyTax: true,
    taxRate: '',
    applyWithholding: false,
    withholdingRate: '',
  });
  const [movimientoForm, setMovimientoForm] = useState({
    concept: '',
    amount: '',
    entryDate: '',
    paymentAccountCode: '5720000',
    categoryAccountCode: '',
    memberId: '',
    applyTax: true,
    taxRate: '',
    applyWithholding: false,
    withholdingRate: '',
  });
  const [taxConfigForm, setTaxConfigForm] = useState({
    vatRateIncome: '21',
    vatRateExpense: '21',
    withholdRateIncome: '0',
    withholdRateExpense: '0',
    applyOnInvoices: true,
    applyOnIncome: true,
    applyOnExpense: true,
    applyWithholdOnInvoices: false,
    applyWithholdOnIncome: false,
    applyWithholdOnExpense: false,
  })
  const tabs = ['Todos','Pendiente','Pagado','Vencido'];
  const contaTabs = ['COBROS', 'DIARIO', 'MAYOR', 'CUENTAS', 'BALANCES'];
  const cuentasTesoreria = ledgerData.accounts.filter((a) => String(a.code || '').startsWith('57') || String(a.code || '').startsWith('56'));
  const cuentasIngreso = ledgerData.accounts.filter((a) => a.nature === 'INCOME');
  const cuentasGasto = ledgerData.accounts.filter((a) => a.nature === 'EXPENSE');
  const movimientosEconomicos = Array.isArray(bundle?.reportTransactions) ? bundle.reportTransactions : [];
  const defaultTaxConfig = bundle?.taxConfig || {};
  useEffect(() => {
    setTaxConfigForm({
      vatRateIncome: String(defaultTaxConfig.vatRateIncome ?? 21),
      vatRateExpense: String(defaultTaxConfig.vatRateExpense ?? 21),
      withholdRateIncome: String(defaultTaxConfig.withholdRateIncome ?? 0),
      withholdRateExpense: String(defaultTaxConfig.withholdRateExpense ?? 0),
      applyOnInvoices: Boolean(defaultTaxConfig.applyOnInvoices ?? true),
      applyOnIncome: Boolean(defaultTaxConfig.applyOnIncome ?? true),
      applyOnExpense: Boolean(defaultTaxConfig.applyOnExpense ?? true),
      applyWithholdOnInvoices: Boolean(defaultTaxConfig.applyWithholdOnInvoices ?? false),
      applyWithholdOnIncome: Boolean(defaultTaxConfig.applyWithholdOnIncome ?? false),
      applyWithholdOnExpense: Boolean(defaultTaxConfig.applyWithholdOnExpense ?? false),
    })
  }, [
    defaultTaxConfig.vatRateIncome,
    defaultTaxConfig.vatRateExpense,
    defaultTaxConfig.applyOnInvoices,
    defaultTaxConfig.applyOnIncome,
    defaultTaxConfig.applyOnExpense,
    defaultTaxConfig.withholdRateIncome,
    defaultTaxConfig.withholdRateExpense,
    defaultTaxConfig.applyWithholdOnInvoices,
    defaultTaxConfig.applyWithholdOnIncome,
    defaultTaxConfig.applyWithholdOnExpense,
  ])
  const movimientosEnRango = movimientosEconomicos.filter((m) => {
    const fecha = String(m.date || m.createdAt || '').slice(0, 10)
    if (!fecha) return true
    if (fechaDesde && fecha < fechaDesde) return false
    if (fechaHasta && fecha > fechaHasta) return false
    return true
  })
  const ingresosManuales = movimientosEnRango
    .filter((m) => m.type === 'INCOME' && m.source === 'MANUAL')
    .reduce((a, m) => a + Number(m.amount || 0), 0)
  const cobrosEnRango = COBROS_UI.filter((c) => {
    const registro = String(c.registro || c.vencimiento || '');
    if (fechaDesde && registro < fechaDesde) return false;
    if (fechaHasta && registro > fechaHasta) return false;
    return true;
  });
  const filtered = cobrosEnRango.filter(c => tab === 'Todos' || c.estado === tab);
  const totales = {
    total: cobrosEnRango.reduce((a,c) => a + c.monto, 0) + ingresosManuales,
    pendiente: cobrosEnRango.filter(c=>c.estado==='Pendiente').reduce((a,c)=>a+c.monto,0),
    pagado: cobrosEnRango.filter(c=>c.estado==='Pagado').reduce((a,c)=>a+c.monto,0) + ingresosManuales,
    vencido: cobrosEnRango.filter(c=>c.estado==='Vencido').reduce((a,c)=>a+c.monto,0),
  };

  const loadAccounting = useCallback(async () => {
    setLedgerBusy(true);
    try {
      const [entriesR, accountsR, periodsR, reportsR] = await Promise.all([
        fetch('/api/crm/accounting/entries', { credentials: 'include' }),
        fetch('/api/crm/accounting/accounts', { credentials: 'include' }),
        fetch('/api/crm/accounting/periods', { credentials: 'include' }),
        fetch('/api/crm/accounting/reports', { credentials: 'include' }),
      ]);
      const [entriesJ, accountsJ, periodsJ, reportsJ] = await Promise.all([
        entriesR.ok ? entriesR.json() : { entries: [] },
        accountsR.ok ? accountsR.json() : { accounts: [] },
        periodsR.ok ? periodsR.json() : { periods: [] },
        reportsR.ok ? reportsR.json() : { trialBalance: [], pnl: [], balanceSheet: { assets: [], liabilities: [], equity: [] }, totals: { debit: 0, credit: 0 } },
      ]);
      setLedgerData({
        entries: entriesJ.entries || [],
        accounts: accountsJ.accounts || [],
        periods: periodsJ.periods || [],
        reports: reportsJ,
      });
    } finally {
      setLedgerBusy(false);
    }
  }, []);

  useEffect(() => {
    loadAccounting().catch(() => {});
  }, [loadAccounting]);

  async function marcarPagado(c) {
    const r = await fetch('/api/crm/invoices/' + c.id + '/mark-paid', { method: 'POST', credentials: 'include' });
    if (!r.ok) { showAlert('No se pudo marcar como pagado'); return; }
    await Promise.all([reload(), loadAccounting()]);
  }

  useEffect(() => {
    function onDocMouseDown(e) {
      const el = e.target as HTMLElement | null
      if (!el?.closest?.('[data-cobro-menu]')) setMenuCobroId(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  async function abrirFactura(c) {
    const invoiceId = String(c?.id || '').trim()
    if (!invoiceId) return
    if (downloadingCobroId === invoiceId) return

    setDownloadingCobroId(invoiceId)
    try {
      const r = await fetch('/api/invoices/' + encodeURIComponent(invoiceId) + '/pdf', {
        credentials: 'include',
      })
      if (!r.ok) {
        showAlert('No se pudo descargar la factura seleccionada.')
        return
      }

      const blob = await r.blob()
      const contentDisposition = r.headers.get('content-disposition') || ''
      const match = /filename="?([^"]+)"?/i.exec(contentDisposition)
      const filename = match?.[1] || `factura-${invoiceId}.pdf`

      const fileUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = fileUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(fileUrl)
    } finally {
      setDownloadingCobroId(null)
    }
  }

  async function copiarIdCobro(c) {
    try {
      await navigator.clipboard.writeText(String(c.id))
    } catch {
      // fallback silencioso
    }
  }

  async function eliminarCobro(c) {
    const invoiceId = String(c?.id || '').trim()
    if (!invoiceId) return
    if (deletingCobroId === invoiceId) return
    const ok = await showConfirm(`¿Eliminar el cobro "${c.concepto}" de ${c.socio}? Esta acción no se puede deshacer.`)
    if (!ok) return

    setDeletingCobroId(invoiceId)
    try {
      const r = await fetch('/api/crm/invoices/' + encodeURIComponent(invoiceId), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!r.ok) {
        let msg = 'No se pudo eliminar el cobro'
        try {
          msg = (await r.json()).error || msg
        } catch {
          //
        }
        showAlert(msg)
        return
      }
      await Promise.all([reload(), loadAccounting()])
    } finally {
      setDeletingCobroId(null)
    }
  }

  function toggleMenuCobro(e, cobroId) {
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuCobroPos({
      top: rect.bottom + 6,
      right: Math.max(12, window.innerWidth - rect.right),
    })
    setMenuCobroId((id) => (id === cobroId ? null : cobroId))
  }

  function openNuevoCobroModal() {
    if (!SOCIOS_UI.length) {
      showAlert('No hay socios para facturar.')
      return
    }
    const today = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 5)
    const dueDate = `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-${pad(nextMonth.getDate())}`
    setNuevoCobroForm({
      memberId: SOCIOS_UI[0].id,
      concepto: 'Cuota mensual',
      amount: '',
      dueDate,
      applyTax: taxConfigForm.applyOnInvoices,
      taxRate: taxConfigForm.vatRateIncome,
      applyWithholding: taxConfigForm.applyWithholdOnInvoices,
      withholdingRate: taxConfigForm.withholdRateIncome,
    })
    setShowNuevoCobroModal(true)
  }

  function openMovimientoModal(type: 'INCOME' | 'EXPENSE') {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const categoryOptions = type === 'INCOME' ? cuentasIngreso : cuentasGasto
    if (!cuentasTesoreria.length || !categoryOptions.length) {
      showAlert('Faltan cuentas PGC activas para registrar este movimiento.')
      return
    }
    setMovimientoType(type)
    setMovimientoForm({
      concept: type === 'INCOME' ? 'Ingreso manual' : 'Gasto manual',
      amount: '',
      entryDate: today,
      paymentAccountCode: cuentasTesoreria[0]?.code || '5720000',
      categoryAccountCode: categoryOptions[0]?.code || '',
      memberId: '',
      applyTax: type === 'INCOME' ? taxConfigForm.applyOnIncome : taxConfigForm.applyOnExpense,
      taxRate: type === 'INCOME' ? taxConfigForm.vatRateIncome : taxConfigForm.vatRateExpense,
      applyWithholding:
        type === 'INCOME'
          ? taxConfigForm.applyWithholdOnIncome
          : taxConfigForm.applyWithholdOnExpense,
      withholdingRate:
        type === 'INCOME'
          ? taxConfigForm.withholdRateIncome
          : taxConfigForm.withholdRateExpense,
    })
    setShowMovimientoModal(true)
  }

  async function submitNuevoCobro(e) {
    e.preventDefault()
    const memberId = String(nuevoCobroForm.memberId || '').trim()
    const concepto = String(nuevoCobroForm.concepto || '').trim()
    const dueDate = String(nuevoCobroForm.dueDate || '').trim()
    const amount = Number(nuevoCobroForm.amount)
    const applyTax = Boolean(nuevoCobroForm.applyTax)
    const taxRate = Number(nuevoCobroForm.taxRate)
    const applyWithholding = Boolean(nuevoCobroForm.applyWithholding)
    const withholdingRate = Number(nuevoCobroForm.withholdingRate)
    if (!memberId || !concepto || !dueDate || !Number.isFinite(amount) || amount <= 0) {
      showAlert('Completa todos los campos del nuevo cobro.')
      return
    }
    setNuevoCobroBusy(true)
    try {
      const r = await fetch('/api/crm/invoices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          concepto,
          amount,
          dueDate,
          applyTax,
          taxRate: Number.isFinite(taxRate) ? taxRate : 0,
          applyWithholding,
          withholdingRate: Number.isFinite(withholdingRate) ? withholdingRate : 0,
        }),
      })
      if (!r.ok) {
        let msg = 'No se pudo crear el cobro'
        try {
          msg = (await r.json()).error || msg
        } catch {
          //
        }
        showAlert(msg)
        return
      }
      setShowNuevoCobroModal(false)
      await reload()
    } finally {
      setNuevoCobroBusy(false)
    }
  }

  async function submitMovimiento(e) {
    e.preventDefault()
    const concept = String(movimientoForm.concept || '').trim()
    const amount = Number(movimientoForm.amount)
    const entryDate = String(movimientoForm.entryDate || '').trim()
    const paymentAccountCode = String(movimientoForm.paymentAccountCode || '').trim()
    const categoryAccountCode = String(movimientoForm.categoryAccountCode || '').trim()
    const memberId = String(movimientoForm.memberId || '').trim()
    const applyTax = Boolean(movimientoForm.applyTax)
    const taxRate = Number(movimientoForm.taxRate)
    const applyWithholding = Boolean(movimientoForm.applyWithholding)
    const withholdingRate = Number(movimientoForm.withholdingRate)
    if (!concept || !entryDate || !paymentAccountCode || !categoryAccountCode || !Number.isFinite(amount) || amount <= 0) {
      showAlert('Completa todos los campos del asiento manual.')
      return
    }
    setMovimientoBusy(true)
    try {
      const r = await fetch('/api/crm/accounting/movements', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movementType: movimientoType,
          concept,
          amount,
          entryDate,
          paymentAccountCode,
          categoryAccountCode,
          memberId: memberId || undefined,
          applyTax,
          taxRate: Number.isFinite(taxRate) ? taxRate : 0,
          applyWithholding,
          withholdingRate: Number.isFinite(withholdingRate) ? withholdingRate : 0,
        }),
      })
      if (!r.ok) {
        let msg = 'No se pudo registrar el movimiento'
        try {
          msg = (await r.json()).error || msg
        } catch {
          //
        }
        showAlert(msg)
        return
      }
      setShowMovimientoModal(false)
      await Promise.all([reload(), loadAccounting()])
    } finally {
      setMovimientoBusy(false)
    }
  }

  async function eliminarMovimientoManual(entry: any) {
    const movementId = String(entry?.sourceId || '').trim()
    if (!movementId) {
      showAlert('Este asiento no tiene un movimiento manual asociado.')
      return
    }
    if (deletingMovementId === movementId) return
    const ok = await showConfirm(`¿Eliminar este ${entry?.source === 'MANUAL' ? 'movimiento manual' : 'movimiento'} y su asiento contable?`)
    if (!ok) return

    setDeletingMovementId(movementId)
    try {
      const r = await fetch('/api/crm/accounting/movements?id=' + encodeURIComponent(movementId), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!r.ok) {
        let msg = 'No se pudo eliminar el movimiento'
        try {
          msg = (await r.json()).error || msg
        } catch {
          //
        }
        showAlert(msg)
        return
      }
      await Promise.all([reload(), loadAccounting()])
    } finally {
      setDeletingMovementId(null)
    }
  }

  async function guardarConfigImpuestos() {
    const vatRateIncome = Number(taxConfigForm.vatRateIncome)
    const vatRateExpense = Number(taxConfigForm.vatRateExpense)
    const withholdRateIncome = Number(taxConfigForm.withholdRateIncome)
    const withholdRateExpense = Number(taxConfigForm.withholdRateExpense)
    if (!Number.isFinite(vatRateIncome) || !Number.isFinite(vatRateExpense) || vatRateIncome < 0 || vatRateExpense < 0) {
      showAlert('Introduce porcentajes de IVA válidos.')
      return
    }
    if (!Number.isFinite(withholdRateIncome) || !Number.isFinite(withholdRateExpense) || withholdRateIncome < 0 || withholdRateExpense < 0) {
      showAlert('Introduce porcentajes de retención válidos.')
      return
    }
    setTaxBusy(true)
    try {
      const r = await fetch('/api/crm/accounting/tax-config', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vatRateIncome,
          vatRateExpense,
          withholdRateIncome,
          withholdRateExpense,
          applyOnInvoices: taxConfigForm.applyOnInvoices,
          applyOnIncome: taxConfigForm.applyOnIncome,
          applyOnExpense: taxConfigForm.applyOnExpense,
          applyWithholdOnInvoices: taxConfigForm.applyWithholdOnInvoices,
          applyWithholdOnIncome: taxConfigForm.applyWithholdOnIncome,
          applyWithholdOnExpense: taxConfigForm.applyWithholdOnExpense,
        }),
      })
      if (!r.ok) {
        let msg = 'No se pudo guardar la configuración de impuestos'
        try {
          msg = (await r.json()).error || msg
        } catch {
          //
        }
        showAlert(msg)
        return
      }
      await reload()
    } finally {
      setTaxBusy(false)
    }
  }

  // === Datos derivados para el resumen Stitch ===
  const ingresosMesMov = movimientosEconomicos
    .filter((m) => m.type === 'INCOME')
    .reduce((a, m) => a + Number(m.amount || 0), 0)
  const gastosMesMov = movimientosEconomicos
    .filter((m) => m.type === 'EXPENSE')
    .reduce((a, m) => a + Number(m.amount || 0), 0)
  const balanceTotal = (bundle?.kpis?.ingresosMes ?? 0) + ingresosMesMov - gastosMesMov
  const ingresosMesTotal = (bundle?.kpis?.ingresosMes ?? 0) + ingresosMesMov
  const numFacturasGasto = movimientosEconomicos.filter((m) => m.type === 'EXPENSE').length
  const sociosPendientes = new Set(
    cobrosEnRango.filter((c) => c.estado === 'Pendiente' || c.estado === 'Vencido').map((c) => c.socio)
  ).size
  const ingresosMesArr: number[] = bundle?.ingresosMensual ?? Array(12).fill(0)
  const semestreData = ingresosMesArr.slice(-6)
  const tesoreriaData = tesoreriaRange === 'semestre' ? semestreData : ingresosMesArr
  const tesoreriaLabels = tesoreriaRange === 'semestre'
    ? Array.from({ length: 6 }, (_, i) => {
        const today = new Date()
        const d = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1)
        return d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
      })
    : ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  // Distribución de gastos: agrupar por cuenta categoría
  const expenseByCategory: Record<string, number> = {}
  for (const m of movimientosEconomicos) {
    if (m.type !== 'EXPENSE') continue
    const key = m.categoryAccountName || m.categoryAccountCode || 'Sin categoría'
    expenseByCategory[key] = (expenseByCategory[key] || 0) + Number(m.amount || 0)
  }
  const expenseDistribution = Object.entries(expenseByCategory)
    .map(([label, val]) => ({ label, value: val }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)
  const expenseTotal = expenseDistribution.reduce((a, x) => a + x.value, 0) || 1
  const categoryColors = ['var(--accent)', 'var(--accent-soft)', 'var(--amber)', 'var(--green)']

  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--surface)'}}>
      <div style={{maxWidth:1440,margin:'0 auto',padding:'32px 40px 56px',display:'flex',flexDirection:'column',gap:32}}>
        {/* Header con título accent + CTAs */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:24,flexWrap:'wrap'}}>
          <div>
            <h1 style={{fontSize:28,fontWeight:700,color:'var(--accent)',letterSpacing:'-0.02em',margin:0,lineHeight:1.1}}>Contabilidad</h1>
            <p style={{color:'var(--text-secondary)',fontSize:14,marginTop:6,margin:0}}>Gestión contable PGC y cobros</p>
          </div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            <button
              type="button"
              onClick={() => { window.location.href = '/api/billing/reports/invoices-csv'; }}
              style={{
                display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
                borderRadius:8,border:'1px solid var(--border-strong)',background:'var(--surface-card)',
                cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:600,color:'var(--text-primary)',
                transition:'all 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-low)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-card)' }}
            >
              <Icon name="export" size={15}/>Exportar datos
            </button>
            <button
              type="button"
              onClick={() => openMovimientoModal('INCOME')}
              style={{
                display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
                borderRadius:8,border:'1px solid rgba(5,150,105,0.35)',background:'var(--green-light)',
                cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,color:'var(--green)',
                transition:'all 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#d1fae5' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--green-light)' }}
            >
              <Icon name="plus" size={15}/>Crear ingreso
            </button>
            <button
              type="button"
              onClick={() => openMovimientoModal('EXPENSE')}
              style={{
                display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
                borderRadius:8,border:'1px solid rgba(185,28,28,0.25)',background:'var(--red-light)',
                cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,color:'var(--red)',
                transition:'all 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--red-light)' }}
            >
              <Icon name="plus" size={15}/>Crear gasto
            </button>
          </div>
        </div>

        {/* KPI grid Stitch */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',
          gap:24
        }}>
          <KPICard
            label="Balance total"
            value={fmtMoney(balanceTotal)}
            sub="Ingresos − gastos del mes"
            icon="billing"
            color="var(--accent-soft)"
            badge={balanceTotal >= 0 ? { kind:'success', text:'En positivo', icon:'trend_up' } : { kind:'danger', text:'En negativo', icon:'trend_down' }}
          />
          <KPICard
            label="Ingresos (mes)"
            value={fmtMoney(ingresosMesTotal)}
            sub="Cuotas + cobros + ingresos manuales"
            icon="reports"
            color="var(--green)"
            badge={ingresosMesTotal > 0 ? { kind:'success', text:'En curso', icon:'trend_up' } : null}
          />
          <KPICard
            label="Gastos (mes)"
            value={fmtMoney(gastosMesMov)}
            sub={`${numFacturasGasto} ${numFacturasGasto === 1 ? 'factura' : 'facturas'}`}
            icon="billing"
            color="var(--red)"
            badge={gastosMesMov > 0 ? { kind:'danger', text:'Salida' } : null}
          />
          {/* Card destacada accent: pendiente de cobro */}
          <div style={{
            background:'linear-gradient(135deg, var(--accent), #003ea8)',
            color:'#fff',borderRadius:12,padding:24,
            boxShadow:'0 10px 24px rgba(0,74,198,0.18)',
            display:'flex',flexDirection:'column',gap:16,flex:'1 1 240px',minWidth:0,
            border:'1px solid rgba(255,255,255,0.08)'
          }}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
              <div style={{
                width:40,height:40,borderRadius:10,
                background:'rgba(255,255,255,0.18)',color:'#fff',
                display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0
              }}>
                <Icon name="billing" size={20}/>
              </div>
              <button
                type="button"
                onClick={() => setContaTab('COBROS')}
                style={{
                  display:'inline-flex',alignItems:'center',gap:4,
                  padding:'4px 10px',borderRadius:999,border:'none',cursor:'pointer',
                  background:'rgba(255,255,255,0.18)',color:'#fff',
                  fontSize:11,fontWeight:700,letterSpacing:'0.02em',fontFamily:'inherit'
                }}
              >Ver lista →</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              <span style={{
                fontSize:11,color:'rgba(255,255,255,0.7)',fontWeight:700,
                letterSpacing:'0.06em',textTransform:'uppercase'
              }}>Pendiente de cobro</span>
              <span style={{fontSize:30,fontWeight:700,letterSpacing:'-0.02em',color:'#fff',lineHeight:1.1}}>{fmtMoney(totales.pendiente + totales.vencido)}</span>
              <span style={{fontSize:12,color:'rgba(255,255,255,0.75)',fontWeight:500}}>
                {sociosPendientes} {sociosPendientes === 1 ? 'socio atrasado' : 'socios atrasados'}
              </span>
            </div>
          </div>
        </div>

        {/* Bento: Evolución de Tesorería + Acciones Rápidas/Distribución */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'minmax(0, 2fr) minmax(0, 1fr)',
          gap:24
        }}>
          {/* Evolución de Tesorería */}
          <div style={{
            background:'var(--surface-card)',borderRadius:12,padding:32,
            boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',
            display:'flex',flexDirection:'column'
          }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24,gap:12,flexWrap:'wrap'}}>
              <div>
                <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Evolución de Tesorería</div>
                <div style={{fontSize:14,color:'var(--text-secondary)',marginTop:4}}>Comparativa {tesoreriaRange === 'semestre' ? 'semestral' : 'anual'} de flujo de caja</div>
              </div>
              <div style={{display:'flex',gap:4,background:'var(--surface-low)',borderRadius:999,padding:4}}>
                <button
                  type="button"
                  onClick={() => setTesoreriaRange('semestre')}
                  style={{
                    padding:'6px 14px',fontSize:12,fontWeight:700,borderRadius:999,border:'none',cursor:'pointer',
                    background: tesoreriaRange === 'semestre' ? 'var(--surface-card)' : 'transparent',
                    color: tesoreriaRange === 'semestre' ? 'var(--accent)' : 'var(--text-muted)',
                    boxShadow: tesoreriaRange === 'semestre' ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                    fontFamily:'inherit'
                  }}
                >Semestre</button>
                <button
                  type="button"
                  onClick={() => setTesoreriaRange('anual')}
                  style={{
                    padding:'6px 14px',fontSize:12,fontWeight:700,borderRadius:999,border:'none',cursor:'pointer',
                    background: tesoreriaRange === 'anual' ? 'var(--surface-card)' : 'transparent',
                    color: tesoreriaRange === 'anual' ? 'var(--accent)' : 'var(--text-muted)',
                    boxShadow: tesoreriaRange === 'anual' ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                    fontFamily:'inherit'
                  }}
                >Anual</button>
              </div>
            </div>
            <BarChart data={tesoreriaData} labels={tesoreriaLabels} color="var(--accent-soft)" height={220}/>
          </div>

          {/* Acciones rápidas + Distribución de gastos */}
          <div style={{display:'flex',flexDirection:'column',gap:24}}>
            <div style={{
              background:'var(--surface-card)',borderRadius:12,padding:24,
              boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',
            }}>
              <div style={{fontWeight:600,fontSize:16,color:'var(--text-primary)',letterSpacing:'-0.01em',marginBottom:16}}>Acciones Rápidas</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <button
                  type="button"
                  onClick={openNuevoCobroModal}
                  style={{
                    display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,
                    padding:'18px 8px',borderRadius:12,border:'1px solid var(--border)',
                    background:'var(--accent-pill)',cursor:'pointer',color:'var(--accent)',
                    fontFamily:'inherit',fontSize:13,fontWeight:600,transition:'all 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  <div style={{
                    width:36,height:36,borderRadius:'50%',background:'var(--accent)',color:'#fff',
                    display:'flex',alignItems:'center',justifyContent:'center'
                  }}>
                    <Icon name="plus" size={18}/>
                  </div>
                  <span style={{textAlign:'center',lineHeight:1.2}}>Nueva Factura</span>
                </button>
                <button
                  type="button"
                  onClick={() => openMovimientoModal('EXPENSE')}
                  style={{
                    display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,
                    padding:'18px 8px',borderRadius:12,border:'1px solid var(--border)',
                    background:'var(--red-light)',cursor:'pointer',color:'var(--red)',
                    fontFamily:'inherit',fontSize:13,fontWeight:600,transition:'all 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--red)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  <div style={{
                    width:36,height:36,borderRadius:'50%',background:'var(--red)',color:'#fff',
                    display:'flex',alignItems:'center',justifyContent:'center'
                  }}>
                    <Icon name="billing" size={18}/>
                  </div>
                  <span style={{textAlign:'center',lineHeight:1.2}}>Registrar Gasto</span>
                </button>
              </div>
            </div>

            <div style={{
              background:'var(--surface-card)',borderRadius:12,padding:24,
              boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',
            }}>
              <div style={{fontWeight:600,fontSize:16,color:'var(--text-primary)',letterSpacing:'-0.01em',marginBottom:16}}>Distribución de Gastos</div>
              {expenseDistribution.length === 0 ? (
                <div style={{fontSize:13,color:'var(--text-muted)',padding:'12px 0'}}>Aún no hay gastos registrados.</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  {expenseDistribution.map((d, i) => {
                    const pct = Math.round((d.value / expenseTotal) * 100)
                    const color = categoryColors[i % categoryColors.length]
                    return (
                      <div key={d.label}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                          <span style={{fontSize:13,color:'var(--text-primary)',fontWeight:500}}>{d.label}</span>
                          <span style={{fontSize:13,fontWeight:700,color:'var(--text-secondary)'}}>{pct}%</span>
                        </div>
                        <div style={{height:8,background:'var(--surface-low)',borderRadius:999,overflow:'hidden'}}>
                          <div style={{
                            width:`${Math.max(pct, 2)}%`,height:'100%',
                            background:color,borderRadius:999,transition:'width 0.4s'
                          }}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      {/* Tabs PGC + Cobros */}
      <div style={{display:'flex',gap:4,background:'var(--surface-low)',borderRadius:999,padding:4,width:'fit-content'}}>
        {contaTabs.map((t) => (
          <button key={t} type="button" onClick={() => setContaTab(t)} style={{
            padding:'8px 18px',borderRadius:999,border:'none',cursor:'pointer',
            background:contaTab===t?'var(--surface-card)':'transparent',
            color:contaTab===t?'var(--accent)':'var(--text-muted)',
            fontFamily:'inherit',fontSize:12,fontWeight:700,letterSpacing:'0.02em',
            boxShadow: contaTab===t ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
            transition:'all 0.15s'
          }}>{t}</button>
        ))}
      </div>

      <div style={{background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:12,padding:'16px 20px',display:'flex',gap:14,alignItems:'center',flexWrap:'wrap',boxShadow:'var(--card-shadow)'}}>
        <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)',minWidth:130,letterSpacing:'0.02em'}}>Configuración impuestos</div>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#475569'}}>
          IVA ingreso %
          <input type="number" min={0} step="0.01" value={taxConfigForm.vatRateIncome} onChange={(e)=>setTaxConfigForm((s)=>({...s,vatRateIncome:e.target.value}))} style={{width:78,padding:'6px 8px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit'}} />
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#475569'}}>
          IVA gasto %
          <input type="number" min={0} step="0.01" value={taxConfigForm.vatRateExpense} onChange={(e)=>setTaxConfigForm((s)=>({...s,vatRateExpense:e.target.value}))} style={{width:78,padding:'6px 8px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit'}} />
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#475569'}}>
          Retención ingreso %
          <input type="number" min={0} step="0.01" value={taxConfigForm.withholdRateIncome} onChange={(e)=>setTaxConfigForm((s)=>({...s,withholdRateIncome:e.target.value}))} style={{width:78,padding:'6px 8px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit'}} />
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#475569'}}>
          Retención gasto %
          <input type="number" min={0} step="0.01" value={taxConfigForm.withholdRateExpense} onChange={(e)=>setTaxConfigForm((s)=>({...s,withholdRateExpense:e.target.value}))} style={{width:78,padding:'6px 8px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit'}} />
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#475569'}}>
          <input type="checkbox" checked={taxConfigForm.applyOnInvoices} onChange={(e)=>setTaxConfigForm((s)=>({...s,applyOnInvoices:e.target.checked}))}/>
          Aplicar en cobros
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#475569'}}>
          <input type="checkbox" checked={taxConfigForm.applyOnIncome} onChange={(e)=>setTaxConfigForm((s)=>({...s,applyOnIncome:e.target.checked}))}/>
          Aplicar en ingresos
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#475569'}}>
          <input type="checkbox" checked={taxConfigForm.applyOnExpense} onChange={(e)=>setTaxConfigForm((s)=>({...s,applyOnExpense:e.target.checked}))}/>
          Aplicar en gastos
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#475569'}}>
          <input type="checkbox" checked={taxConfigForm.applyWithholdOnInvoices} onChange={(e)=>setTaxConfigForm((s)=>({...s,applyWithholdOnInvoices:e.target.checked}))}/>
          Retención en cobros
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#475569'}}>
          <input type="checkbox" checked={taxConfigForm.applyWithholdOnIncome} onChange={(e)=>setTaxConfigForm((s)=>({...s,applyWithholdOnIncome:e.target.checked}))}/>
          Retención en ingresos
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#475569'}}>
          <input type="checkbox" checked={taxConfigForm.applyWithholdOnExpense} onChange={(e)=>setTaxConfigForm((s)=>({...s,applyWithholdOnExpense:e.target.checked}))}/>
          Retención en gastos
        </label>
        <button type="button" disabled={taxBusy} onClick={guardarConfigImpuestos} style={{marginLeft:'auto',padding:'9px 16px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',fontFamily:'inherit',fontSize:12,fontWeight:700,cursor:taxBusy?'not-allowed':'pointer',opacity:taxBusy?0.7:1,letterSpacing:'0.02em'}}>
          {taxBusy ? 'Guardando…' : 'Guardar impuestos'}
        </button>
      </div>

      {contaTab !== 'COBROS' && (
      <div style={{background:'var(--surface-card)',borderRadius:12,padding:24,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)'}}>
        {ledgerBusy ? (
          <div style={{fontSize:13,color:'#64748b'}}>Cargando datos contables…</div>
        ) : contaTab === 'DIARIO' ? (
          <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:380,overflowY:'auto'}}>
            {ledgerData.entries.map((e) => (
              <div key={e.id} style={{padding:'10px 12px',border:'1px solid var(--border)',borderRadius:10}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:12}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:'#0f172a'}}>{e.entryNumber} · {e.concept}</div>
                    <div style={{fontSize:12,color:'#64748b'}}>
                      {new Date(e.entryDate).toLocaleDateString('es-ES')} · {e.status} · {e.source}
                    </div>
                  </div>
                  {e.source === 'MANUAL' && e.sourceId && (
                    <button
                      type="button"
                      disabled={deletingMovementId === e.sourceId}
                      onClick={() => eliminarMovimientoManual(e)}
                      style={{
                        alignSelf:'center',
                        padding:'6px 10px',
                        borderRadius:8,
                        border:'1px solid rgba(239,68,68,0.25)',
                        background:'#fff',
                        cursor: deletingMovementId === e.sourceId ? 'not-allowed' : 'pointer',
                        color:'#b91c1c',
                        fontFamily:'inherit',
                        fontSize:12,
                        fontWeight:700,
                        opacity: deletingMovementId === e.sourceId ? 0.6 : 1,
                      }}
                    >
                      {deletingMovementId === e.sourceId ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  )}
                </div>
                <div style={{marginTop:8,display:'grid',gap:6}}>
                  {(e.lines || []).map((l: any) => (
                    <div key={l.id} style={{display:'grid',gridTemplateColumns:'72px 1fr auto',gap:10,fontSize:12,alignItems:'center'}}>
                      <span style={{
                        width:'fit-content',
                        padding:'2px 8px',
                        borderRadius:999,
                        fontWeight:700,
                        background:l.side==='DEBIT' ? '#eff6ff' : '#fef2f2',
                        color:l.side==='DEBIT' ? '#1d4ed8' : '#b91c1c',
                      }}>
                        {l.side === 'DEBIT' ? 'Debe' : 'Haber'}
                      </span>
                      <span style={{color:'#374151'}}>
                        {l.account?.code} · {l.account?.name}
                        {l.lineConcept ? ` · ${l.lineConcept}` : ''}
                      </span>
                      <span style={{fontWeight:700,color:'#111827'}}>{fmtMoney(Number(l.amount || 0))}</span>
                    </div>
                  ))}
                  <div style={{display:'flex',justifyContent:'flex-end',fontSize:12,color:'#475569',fontWeight:700}}>
                    Total asiento: {fmtMoney((e.lines || []).reduce((a: number, l: any) => a + Number(l.amount || 0), 0) / 2)}
                  </div>
                </div>
              </div>
            ))}
            {ledgerData.entries.length === 0 && <div style={{fontSize:13,color:'#64748b'}}>Sin asientos.</div>}
          </div>
        ) : contaTab === 'MAYOR' ? (
          <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:380,overflowY:'auto'}}>
            {(ledgerData.reports?.trialBalance || []).map((r: any) => (
              <div key={r.code} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:12,padding:'10px 12px',border:'1px solid var(--border)',borderRadius:10,fontSize:13}}>
                <span>{r.code} · {r.name}</span>
                <span>Debe {fmtMoney(r.debit)}</span>
                <span>Haber {fmtMoney(r.credit)}</span>
                <span>Saldo {fmtMoney((r.debit || 0) - (r.credit || 0))}</span>
              </div>
            ))}
          </div>
        ) : contaTab === 'CUENTAS' ? (
          <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:380,overflowY:'auto'}}>
            {ledgerData.accounts.map((a) => (
              <div key={a.id} style={{padding:'10px 12px',border:'1px solid var(--border)',borderRadius:10,fontSize:13}}>
                {a.code} · {a.name} · {a.nature}
              </div>
            ))}
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{padding:12,border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>Balance comprobación</div>
              <div style={{fontSize:12,color:'#475569'}}>Debe {fmtMoney(ledgerData.reports?.totals?.debit || 0)} · Haber {fmtMoney(ledgerData.reports?.totals?.credit || 0)}</div>
            </div>
            <div style={{padding:12,border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>Periodos fiscales</div>
              <div style={{fontSize:12,color:'#475569'}}>{ledgerData.periods.length} periodos ({ledgerData.periods.filter((p) => p.isClosed).length} cerrados)</div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Table card: Facturación reciente */}
      {contaTab === 'COBROS' && (
      <div style={{background:'var(--surface-card)',borderRadius:12,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',overflow:'hidden'}}>
        <div style={{padding:'24px 32px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <div>
            <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Facturación Reciente</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginTop:4}}>Historial de pagos y cobros</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              style={{padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'var(--text-primary)',background:'var(--surface-card)'}}
            />
            <span style={{fontSize:12,color:'var(--text-muted)'}}>—</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              style={{padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'var(--text-primary)',background:'var(--surface-card)'}}
            />
            <button
              type="button"
              onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
              style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,color:'var(--text-secondary)'}}
            >Limpiar</button>
          </div>
        </div>
        <div style={{padding:'14px 32px 0',display:'flex',gap:4,background:'var(--surface-card)'}}>
          {tabs.map(t => (
            <button key={t} type="button" onClick={()=>setTab(t)} style={{
              padding:'8px 16px',borderRadius:8,border:'none',cursor:'pointer',
              background:tab===t?'var(--accent-pill)':'transparent',
              color:tab===t?'var(--accent)':'var(--text-muted)',
              fontFamily:'inherit',fontSize:12,fontWeight:700,letterSpacing:'0.02em'
            }}>{t}{t!=='Todos' && ` (${cobrosEnRango.filter(c=>c.estado===t).length})`}</button>
          ))}
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',marginTop:8}}>
          <thead>
            <tr style={{background:'var(--surface-low)'}}>
              {['Socio','Concepto','Deporte','Importe','Vencimiento','Estado',''].map(h => (
                <th key={h} style={{padding:'12px 32px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{padding:'32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>Sin facturas en el rango seleccionado.</td></tr>
            )}
            {filtered.map((c, i) => (
              <tr key={c.id} style={{borderTop:'1px solid var(--border)'}}>
                <td style={{padding:'16px 32px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <Avatar initials={c.socio.split(' ').map(w=>w[0]).join('').slice(0,2)} color="var(--accent-soft)" size={36}/>
                    <span style={{fontWeight:600,fontSize:14,color:'var(--text-primary)'}}>{c.socio}</span>
                  </div>
                </td>
                <td style={{padding:'16px 32px',fontSize:13,color:'var(--text-secondary)'}}>{c.concepto}</td>
                <td style={{padding:'16px 32px',fontSize:13,color:'var(--text-secondary)'}}>{c.deporte}</td>
                <td style={{padding:'16px 32px'}}>
                  <div style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>{fmtMoney(c.monto)}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>
                    Base {fmtMoney(Number(c.subtotal || 0))} · IVA {fmtMoney(Number(c.iva || 0))} · Ret. {fmtMoney(Number(c.retencion || 0))}
                  </div>
                </td>
                <td style={{padding:'16px 32px',fontSize:13,color:c.estado==='Vencido'?'var(--red)':'var(--text-secondary)',fontWeight:c.estado==='Vencido'?600:400}}>
                  {new Date(c.vencimiento).toLocaleDateString('es-ES')}
                </td>
                <td style={{padding:'16px 32px'}}><Badge status={c.estado}/></td>
                <td style={{padding:'16px 32px'}}>
                  <div style={{display:'flex',justifyContent:'flex-end'}} data-cobro-menu>
                    <button
                      type="button"
                      onClick={(e) => toggleMenuCobro(e, c.id)}
                      style={{padding:6,borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',cursor:'pointer',color:'var(--text-muted)',transition:'all 0.15s'}}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                    >
                      <Icon name="dots" size={14}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {contaTab === 'COBROS' && menuCobroId && (
        <div
          data-cobro-menu
          style={{
            position:'fixed',
            top: menuCobroPos.top,
            right: menuCobroPos.right,
            minWidth:170,
            background:'#fff',
            border:'1px solid var(--border)',
            borderRadius:10,
            boxShadow:'0 10px 24px rgba(15,23,42,0.14)',
            overflow:'hidden',
            zIndex:1200,
          }}
        >
          {(() => {
            const cobroActivo = filtered.find((x) => x.id === menuCobroId) || COBROS_UI.find((x) => x.id === menuCobroId)
            if (!cobroActivo) return null
            return (
              <>
                {cobroActivo.estado !== 'Pagado' && (
                  <button
                    type="button"
                    onClick={async () => { setMenuCobroId(null); await marcarPagado(cobroActivo) }}
                    style={{width:'100%',textAlign:'left',padding:'10px 12px',border:'none',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,color:'var(--green)',fontWeight:600}}
                  >
                    Marcar pagado
                  </button>
                )}
                <button
                  type="button"
                  disabled={downloadingCobroId === cobroActivo.id}
                  onClick={async () => { setMenuCobroId(null); await abrirFactura(cobroActivo) }}
                  style={{width:'100%',textAlign:'left',padding:'10px 12px',border:'none',borderTop:'1px solid var(--border)',background:'#fff',cursor:downloadingCobroId === cobroActivo.id ? 'not-allowed' : 'pointer',fontFamily:'inherit',fontSize:13,color:'#374151',fontWeight:500,opacity:downloadingCobroId === cobroActivo.id ? 0.65 : 1}}
                >
                  {downloadingCobroId === cobroActivo.id ? 'Descargando…' : 'Ver factura'}
                </button>
                <button
                  type="button"
                  onClick={async () => { setMenuCobroId(null); await copiarIdCobro(cobroActivo) }}
                  style={{width:'100%',textAlign:'left',padding:'10px 12px',border:'none',borderTop:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,color:'#374151',fontWeight:500}}
                >
                  Copiar ID
                </button>
                <button
                  type="button"
                  disabled={deletingCobroId === cobroActivo.id}
                  onClick={async () => { setMenuCobroId(null); await eliminarCobro(cobroActivo) }}
                  style={{width:'100%',textAlign:'left',padding:'10px 12px',border:'none',borderTop:'1px solid var(--border)',background:'#fff',cursor:deletingCobroId === cobroActivo.id ? 'not-allowed' : 'pointer',fontFamily:'inherit',fontSize:13,color:'var(--red)',fontWeight:600,opacity:deletingCobroId === cobroActivo.id ? 0.65 : 1}}
                >
                  {deletingCobroId === cobroActivo.id ? 'Eliminando…' : 'Eliminar cobro'}
                </button>
              </>
            )
          })()}
        </div>
      )}

      {showMovimientoModal && (
        <div
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !movimientoBusy) setShowMovimientoModal(false)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 520,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={submitMovimiento}
            style={{
              width: '100%',
              maxWidth: 560,
              background: '#fff',
              borderRadius: 16,
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.28)',
              padding: 28,
              fontFamily: 'inherit',
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111827' }}>
                {movimientoType === 'INCOME' ? 'Crear ingreso (PGC)' : 'Crear gasto (PGC)'}
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
                Se registra simultáneamente en Diario y en movimientos económicos.
              </p>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>Concepto</label>
            <input
              value={movimientoForm.concept}
              onChange={(e) => setMovimientoForm((f) => ({ ...f, concept: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', marginBottom: 12, fontFamily: 'inherit' }}
              placeholder={movimientoType === 'INCOME' ? 'Ej. Patrocinio local' : 'Ej. Compra material deportivo'}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>Importe (€)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={movimientoForm.amount}
                  onChange={(e) => setMovimientoForm((f) => ({ ...f, amount: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>Fecha contable</label>
                <input
                  type="date"
                  value={movimientoForm.entryDate}
                  onChange={(e) => setMovimientoForm((f) => ({ ...f, entryDate: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10 }}>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#475569'}}>
                <input
                  type="checkbox"
                  checked={Boolean(movimientoForm.applyTax)}
                  onChange={(e) => setMovimientoForm((f) => ({ ...f, applyTax: e.target.checked }))}
                />
                Aplicar IVA
              </label>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>IVA %</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={movimientoForm.taxRate}
                  onChange={(e) => setMovimientoForm((f) => ({ ...f, taxRate: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10 }}>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#475569'}}>
                <input
                  type="checkbox"
                  checked={Boolean(movimientoForm.applyWithholding)}
                  onChange={(e) => setMovimientoForm((f) => ({ ...f, applyWithholding: e.target.checked }))}
                />
                Aplicar retención
              </label>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>Retención %</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={movimientoForm.withholdingRate}
                  onChange={(e) => setMovimientoForm((f) => ({ ...f, withholdingRate: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{marginTop:10,fontSize:12,color:'#475569'}}>
              Total movimiento (tesorería neta): {fmtMoney(
                Number(movimientoForm.amount || 0) *
                  (1 + (Boolean(movimientoForm.applyTax) ? Number(movimientoForm.taxRate || 0) / 100 : 0)) -
                  Number(movimientoForm.amount || 0) *
                    (Boolean(movimientoForm.applyWithholding) ? Number(movimientoForm.withholdingRate || 0) / 100 : 0)
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>Cuenta tesorería (57/56)</label>
                <select
                  value={movimientoForm.paymentAccountCode}
                  onChange={(e) => setMovimientoForm((f) => ({ ...f, paymentAccountCode: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
                >
                  {cuentasTesoreria.map((a) => (
                    <option key={a.id} value={a.code}>{a.code} · {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>
                  {movimientoType === 'INCOME' ? 'Cuenta ingreso (grupo 7)' : 'Cuenta gasto (grupo 6)'}
                </label>
                <select
                  value={movimientoForm.categoryAccountCode}
                  onChange={(e) => setMovimientoForm((f) => ({ ...f, categoryAccountCode: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
                >
                  {(movimientoType === 'INCOME' ? cuentasIngreso : cuentasGasto).map((a) => (
                    <option key={a.id} value={a.code}>{a.code} · {a.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginTop: 12, marginBottom: 6, display: 'block' }}>Socio (opcional, trazabilidad)</label>
            <select
              value={movimientoForm.memberId}
              onChange={(e) => setMovimientoForm((f) => ({ ...f, memberId: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
            >
              <option value="">Sin socio asociado</option>
              {SOCIOS_UI.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                disabled={movimientoBusy}
                onClick={() => setShowMovimientoModal(false)}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.09)', background: '#fff', cursor: movimientoBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#374151' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={movimientoBusy}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none', background: 'var(--accent)', cursor: movimientoBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#fff', opacity: movimientoBusy ? 0.75 : 1 }}
              >
                {movimientoBusy ? 'Registrando…' : movimientoType === 'INCOME' ? 'Crear ingreso' : 'Crear gasto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {contaTab === 'COBROS' && showNuevoCobroModal && (
        <div
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !nuevoCobroBusy) setShowNuevoCobroModal(false)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={submitNuevoCobro}
            style={{
              width: '100%',
              maxWidth: 520,
              background: '#fff',
              borderRadius: 16,
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.28)',
              padding: 28,
              fontFamily: 'inherit',
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111827' }}>Nuevo cobro</h3>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
                Crea un cobro manual sin salir de esta vista.
              </p>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>Socio</label>
            <select
              value={nuevoCobroForm.memberId}
              onChange={(e) => setNuevoCobroForm((f) => ({ ...f, memberId: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', marginBottom: 12, fontFamily: 'inherit' }}
            >
              {SOCIOS_UI.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>

            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>Concepto</label>
            <input
              value={nuevoCobroForm.concepto}
              onChange={(e) => setNuevoCobroForm((f) => ({ ...f, concepto: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', marginBottom: 12, fontFamily: 'inherit' }}
              placeholder="Ej. Cuota mensual"
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>Importe (€)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={nuevoCobroForm.amount}
                  onChange={(e) => setNuevoCobroForm((f) => ({ ...f, amount: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>Vencimiento</label>
                <input
                  type="date"
                  value={nuevoCobroForm.dueDate}
                  onChange={(e) => setNuevoCobroForm((f) => ({ ...f, dueDate: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10 }}>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#475569'}}>
                <input
                  type="checkbox"
                  checked={Boolean(nuevoCobroForm.applyTax)}
                  onChange={(e) => setNuevoCobroForm((f) => ({ ...f, applyTax: e.target.checked }))}
                />
                Aplicar IVA
              </label>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>IVA %</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={nuevoCobroForm.taxRate}
                  onChange={(e) => setNuevoCobroForm((f) => ({ ...f, taxRate: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10 }}>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#475569'}}>
                <input
                  type="checkbox"
                  checked={Boolean(nuevoCobroForm.applyWithholding)}
                  onChange={(e) => setNuevoCobroForm((f) => ({ ...f, applyWithholding: e.target.checked }))}
                />
                Aplicar retención
              </label>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, display: 'block' }}>Retención %</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={nuevoCobroForm.withholdingRate}
                  onChange={(e) => setNuevoCobroForm((f) => ({ ...f, withholdingRate: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{marginTop:10,fontSize:12,color:'#475569'}}>
              Total cobro neto: {fmtMoney(
                Number(nuevoCobroForm.amount || 0) *
                  (1 + (Boolean(nuevoCobroForm.applyTax) ? Number(nuevoCobroForm.taxRate || 0) / 100 : 0)) -
                  Number(nuevoCobroForm.amount || 0) *
                    (Boolean(nuevoCobroForm.applyWithholding) ? Number(nuevoCobroForm.withholdingRate || 0) / 100 : 0)
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                disabled={nuevoCobroBusy}
                onClick={() => setShowNuevoCobroModal(false)}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.09)', background: '#fff', cursor: nuevoCobroBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#374151' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={nuevoCobroBusy}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none', background: 'var(--accent)', cursor: nuevoCobroBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#fff', opacity: nuevoCobroBusy ? 0.75 : 1 }}
              >
                {nuevoCobroBusy ? 'Creando…' : 'Crear cobro'}
              </button>
            </div>
          </form>
        </div>
      )}
      </div>
    </div>
  );
}

function datetimeLocalValue(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const CRM_EVENT_TYPES = [
  { value: 'TRAINING', label: 'Entrenamiento' },
  { value: 'MATCH', label: 'Partido' },
  { value: 'TOURNAMENT', label: 'Torneo' },
  { value: 'SOCIAL', label: 'Reunión / social' },
  { value: 'OTHER', label: 'Otro' },
]

// ── CALENDARIO ──────────────────────────────────────────────────────────────
function Calendario({ setActive }) {
  const { bundle, reload, showAlert } = useCrm();
  const role = normalizeRole(bundle?.user?.role)
  if (!(role === 'ADMIN' || role === 'COACH')) return null
  const EVENTOS_UI = bundle?.eventos ?? [];
  const EQUIPOS_UI = bundle?.equipos ?? [];
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const todayRef = bundle?.meta?.today ? new Date(bundle.meta.today) : new Date();
  const [viewYm, setViewYm] = useState(() => ({
    year: todayRef.getFullYear(),
    month: todayRef.getMonth(),
  }));
  const [selectedDay, setSelectedDay] = useState(null);
  const [showNuevoEventoModal, setShowNuevoEventoModal] = useState(false);
  const [nuevoEventoBusy, setNuevoEventoBusy] = useState(false);
  const [formEvento, setFormEvento] = useState({
    teamId: '',
    title: '',
    type: 'OTHER',
    datetimeLocal: '',
    location: '',
  });

  const evInput = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.09)',
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    color: '#111827',
    outline: 'none',
    boxSizing: 'border-box',
  }
  const evLabel = {
    fontSize: 12,
    fontWeight: 600,
    color: '#64748b',
    marginBottom: 6,
    display: 'block',
    letterSpacing: 0.15,
  }

  function openNuevoEventoModal() {
    if (!EQUIPOS_UI.length) {
      showAlert('Crea antes un equipo (pestaña Equipos).')
      setActive('equipos')
      return
    }
    setFormEvento({
      teamId: EQUIPOS_UI[0].id,
      title: '',
      type: 'OTHER',
      datetimeLocal: datetimeLocalValue(),
      location: '',
    })
    setShowNuevoEventoModal(true)
  }

  async function enviarNuevoEvento(e) {
    e.preventDefault()
    const title = String(formEvento.title || '').trim()
    const teamId = String(formEvento.teamId || '').trim()
    if (!title || !teamId) return
    const d = new Date(formEvento.datetimeLocal)
    if (Number.isNaN(d.getTime())) {
      showAlert('Fecha u hora no válida.')
      return
    }
    setNuevoEventoBusy(true)
    try {
      const r = await fetch('/api/crm/events', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          teamId,
          type: formEvento.type,
          date: d.toISOString(),
          location: formEvento.location.trim() || undefined,
        }),
      })
      if (!r.ok) {
        let msg = 'No se pudo crear el evento'
        try {
          const j = await r.json()
          msg = j.error || msg
        } catch {
          //
        }
        showAlert(msg)
        return
      }
      setShowNuevoEventoModal(false)
      await reload()
    } finally {
      setNuevoEventoBusy(false)
    }
  }
  const year = viewYm.year, month = viewYm.month;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const tipoColors = {Torneo:'#3B82F6',Entrenamiento:'#10B981',Partido:'#F59E0B',Reunión:'#8B5CF6',Competencia:'#EF4444',Especial:'#06B6D4', 'Otro': '#64748b'};

  const eventosEnRango = EVENTOS_UI.filter((e) => {
    const f = String(e.fecha || '')
    if (fechaDesde && f < fechaDesde) return false
    if (fechaHasta && f > fechaHasta) return false
    return true
  })

  const dayEvents = (d) => eventosEnRango.filter(e => new Date(e.fecha).getDate() === d && new Date(e.fecha).getMonth() === month && new Date(e.fecha).getFullYear() === year);

  const monthEvents = eventosEnRango.filter(e => {
    const dt = new Date(e.fecha);
    return dt.getMonth() === month && dt.getFullYear() === year;
  });

  const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const monthTitle = new Date(year, month, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  useEffect(() => { setSelectedDay(null); }, [year, month]);

  const isTodayMarker = (d) => (
    todayRef.getDate()===d && todayRef.getMonth()===month && todayRef.getFullYear()===year
  );

  // KPIs Calendario
  const eventosMes = monthEvents.length
  const partidosMes = monthEvents.filter(e => e.tipo === 'Partido' || e.tipo === 'Torneo').length
  const entrenosMes = monthEvents.filter(e => e.tipo === 'Entrenamiento').length
  const proximoEvento = [...EVENTOS_UI].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
    .find(e => new Date(e.fecha) >= todayRef)

  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--surface)'}}>
      <div style={{maxWidth:1440,margin:'0 auto',padding:'32px 40px 56px',display:'flex',flexDirection:'column',gap:32}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:24,flexWrap:'wrap'}}>
          <div>
            <h1 style={{fontSize:28,fontWeight:700,color:'var(--accent)',letterSpacing:'-0.02em',margin:0,lineHeight:1.1}}>Calendario</h1>
            <p style={{color:'var(--text-secondary)',fontSize:14,marginTop:6,margin:0,textTransform:'capitalize'}}>{monthTitle}</p>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              style={{padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'var(--text-primary)',background:'var(--surface-card)'}}
            />
            <span style={{fontSize:12,color:'var(--text-muted)'}}>—</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              style={{padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'var(--text-primary)',background:'var(--surface-card)'}}
            />
            <button
              type="button"
              onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
              style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,color:'var(--text-secondary)'}}
            >Limpiar</button>
            <div style={{display:'flex',gap:4,background:'var(--surface-low)',borderRadius:8,padding:4}}>
              <button type="button" onClick={() => setViewYm(prev => {
                let m = prev.month - 1, y = prev.year;
                if (m < 0) { m = 11; y--; }
                return { year:y, month:m };
              })} style={{padding:'6px 12px',borderRadius:6,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,color:'var(--text-secondary)'}}>←</button>
              <button type="button" onClick={() => setViewYm({ year: todayRef.getFullYear(), month: todayRef.getMonth() })} style={{padding:'6px 12px',borderRadius:6,border:'none',background:'var(--surface-card)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,color:'var(--accent)',boxShadow:'0 1px 2px rgba(0,0,0,0.04)'}}>Hoy</button>
              <button type="button" onClick={() => setViewYm(prev => {
                let m = prev.month + 1, y = prev.year;
                if (m > 11) { m = 0; y++; }
                return { year:y, month:m };
              })} style={{padding:'6px 12px',borderRadius:6,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,color:'var(--text-secondary)'}}>→</button>
            </div>
            <button
              type="button"
              onClick={openNuevoEventoModal}
              style={{
                display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
                borderRadius:8,border:'none',cursor:'pointer',
                background:'var(--accent)',color:'#fff',
                fontFamily:'inherit',fontSize:13,fontWeight:700,
                boxShadow:'0 1px 2px rgba(0,74,198,0.2)',transition:'all 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
            >
              <Icon name="plus" size={15}/>Nuevo evento
            </button>
          </div>
        </div>

        {/* KPI grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',gap:24}}>
          <KPICard label="Eventos del mes" value={String(eventosMes)} sub="Programados" icon="calendar" color="var(--accent-soft)" badge={{ kind:'info', text:'Mes' }}/>
          <KPICard label="Partidos / torneos" value={String(partidosMes)} sub="En competición" icon="dashboard" color="var(--amber)"/>
          <KPICard label="Entrenamientos" value={String(entrenosMes)} sub="Sesiones programadas" icon="users" color="var(--green)"/>
          <KPICard
            label="Próximo evento"
            value={proximoEvento ? new Date(proximoEvento.fecha).toLocaleDateString('es-ES', { day:'2-digit', month:'short' }) : '—'}
            sub={proximoEvento ? proximoEvento.titulo : 'Sin eventos futuros'}
            icon="calendar"
            color="var(--accent)"
            badge={proximoEvento ? { kind:'success', text:'Agendado' } : null}
          />
        </div>

        {/* Bento: calendar grid + eventos del día */}
        <div style={{display:'grid',gridTemplateColumns:'minmax(0, 2fr) minmax(0, 1fr)',gap:24}}>
          {/* Calendar grid */}
          <div style={{background:'var(--surface-card)',borderRadius:12,padding:32,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4,marginBottom:8}}>
              {days.map(d => (
                <div key={d} style={{textAlign:'center',fontSize:11,fontWeight:700,color:'var(--text-muted)',padding:'8px 0',textTransform:'uppercase',letterSpacing:'0.06em'}}>{d}</div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>
              {Array(firstDay).fill(null).map((_,i)=><div key={`e${i}`}/>)}
              {Array(daysInMonth).fill(null).map((_,i)=>{
                const d = i+1;
                const evts = dayEvents(d);
                const isSelected = selectedDay === d;
                const isToday = isTodayMarker(d);
                return (
                  <div key={d} onClick={()=>setSelectedDay(d===selectedDay?null:d)} style={{
                    minHeight:90,padding:'8px',borderRadius:10,cursor:'pointer',
                    background:isSelected?'var(--accent-pill)':'var(--surface-low)',
                    border:`1px solid ${isSelected?'var(--accent)':'transparent'}`,
                    transition:'all 0.15s'
                  }}>
                    <div style={{
                      width:26,height:26,borderRadius:'50%',
                      background:isToday?'var(--accent)':'transparent',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:13,fontWeight:isToday?700:600,
                      color:isToday?'#fff':'var(--text-primary)',marginBottom:6
                    }}>{d}</div>
                    {evts.slice(0,3).map(e => {
                      const tc = tipoColors[e.tipo] || 'var(--text-muted)';
                      return (
                      <div key={e.id} style={{
                        fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:4,marginBottom:2,
                        background:`${tc}20`,color:tc,
                        whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'
                      }}>{e.titulo}</div>
                    );})}
                    {evts.length > 3 && (
                      <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:600,marginTop:2}}>+{evts.length - 3} más</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Events list */}
          <div style={{background:'var(--surface-card)',borderRadius:12,padding:24,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',display:'flex',flexDirection:'column'}}>
            <div style={{fontWeight:600,fontSize:16,color:'var(--text-primary)',letterSpacing:'-0.01em',marginBottom:4}}>
              {selectedDay ? `Eventos del día ${selectedDay}` : 'Todos los eventos del mes'}
            </div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>
              {(selectedDay ? dayEvents(selectedDay) : monthEvents).length} {(selectedDay ? dayEvents(selectedDay) : monthEvents).length === 1 ? 'evento' : 'eventos'}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10,maxHeight:520,overflowY:'auto'}}>
              {(selectedDay ? dayEvents(selectedDay) : monthEvents).map(e => {
                const tc = tipoColors[e.tipo] || 'var(--text-muted)';
                return (
                  <div key={e.id} style={{
                    padding:14,borderRadius:10,
                    background:'var(--surface-low)',
                    borderLeft:`3px solid ${tc}`
                  }}>
                    <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>{e.titulo}</div>
                    <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:2}}>{new Date(e.fecha).toLocaleDateString('es-ES')} · {e.hora}</div>
                    {e.lugar && <div style={{fontSize:12,color:'var(--text-muted)'}}>{e.lugar}</div>}
                    <div style={{display:'flex',gap:6,marginTop:8,flexWrap:'wrap'}}>
                      <span style={{
                        fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:999,
                        background:`${tc}20`,color:tc,letterSpacing:'0.02em'
                      }}>{e.tipo}</span>
                      {e.equipo && (
                        <span style={{
                          fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:999,
                          background:'var(--surface-card)',color:'var(--text-secondary)',border:'1px solid var(--border)'
                        }}>{e.equipo}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {(selectedDay ? dayEvents(selectedDay) : monthEvents).length === 0 && (
                <div style={{textAlign:'center',padding:'24px 0',color:'var(--text-muted)',fontSize:13}}>
                  {selectedDay ? 'Sin eventos este día' : 'Sin eventos este mes'}
                </div>
              )}
            </div>
          </div>
        </div>
      {showNuevoEventoModal && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 400,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget || nuevoEventoBusy) return;
            setShowNuevoEventoModal(false);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="nuevo-evento-title"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={enviarNuevoEvento}
            style={{
              width: '100%',
              maxWidth: 460,
              maxHeight: '92vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 16,
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.28), 0 0 1px rgba(0,0,0,0.08)',
              padding: 28,
              fontFamily: 'inherit',
            }}
          >
            <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <h2 id="nuevo-evento-title" style={{ margin: '0 0 6px 0', fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.4px' }}>
                  Nuevo evento
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                  Elige equipo, tipo y fecha. Aparecerá en el calendario del club.
                </p>
              </div>
              <button
                type="button"
                disabled={nuevoEventoBusy}
                onClick={() => setShowNuevoEventoModal(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  cursor: nuevoEventoBusy ? 'not-allowed' : 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                aria-label="Cerrar"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={evLabel}>Equipo *</label>
                <select
                  required
                  value={formEvento.teamId}
                  onChange={(e) => setFormEvento((p) => ({ ...p, teamId: e.target.value }))}
                  style={{ ...evInput, cursor: 'pointer' }}
                >
                  {EQUIPOS_UI.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.nombre}
                      {eq.categoria && eq.categoria !== '—' ? ` (${eq.categoria})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={evLabel}>Título *</label>
                <input
                  required
                  autoFocus
                  value={formEvento.title}
                  onChange={(e) => setFormEvento((p) => ({ ...p, title: e.target.value }))}
                  style={evInput}
                  placeholder="Ej. Entrenamiento conjunto"
                />
              </div>
              <div>
                <label style={evLabel}>Tipo</label>
                <select
                  value={formEvento.type}
                  onChange={(e) => setFormEvento((p) => ({ ...p, type: e.target.value }))}
                  style={{ ...evInput, cursor: 'pointer' }}
                >
                  {CRM_EVENT_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={evLabel}>Fecha y hora *</label>
                <input
                  required
                  type="datetime-local"
                  value={formEvento.datetimeLocal}
                  onChange={(e) => setFormEvento((p) => ({ ...p, datetimeLocal: e.target.value }))}
                  style={evInput}
                />
              </div>
              <div>
                <label style={evLabel}>Lugar (opcional)</label>
                <input
                  value={formEvento.location}
                  onChange={(e) => setFormEvento((p) => ({ ...p, location: e.target.value }))}
                  style={evInput}
                  placeholder="Pabellón, cancha…"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 26 }}>
              <button
                type="button"
                disabled={nuevoEventoBusy}
                onClick={() => setShowNuevoEventoModal(false)}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: '1.5px solid rgba(0,0,0,0.09)',
                  background: '#fff',
                  cursor: nuevoEventoBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#374151',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={nuevoEventoBusy}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--accent)',
                  cursor: nuevoEventoBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  opacity: nuevoEventoBusy ? 0.75 : 1,
                }}
              >
                {nuevoEventoBusy ? 'Creando…' : 'Crear evento'}
              </button>
            </div>
          </form>
        </div>
      )}
      </div>
    </div>
  );
}

// ── INFORMES ────────────────────────────────────────────────────────────────
function Informes({ setActive }) {
  const { bundle, fmtMoney } = useCrm();
  const role = normalizeRole(bundle?.user?.role)
  if (!(role === 'ADMIN' || role === 'TREASURER')) return null
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const reportTx = bundle?.reportTransactions ?? [];
  const txFiltradas = reportTx.filter((t) => {
    const d = String(t.date || '');
    if (fechaDesde && d < fechaDesde) return false;
    if (fechaHasta && d > fechaHasta) return false;
    return true;
  });
  const ingresos = Array(12).fill(0);
  const egresos = Array(12).fill(0);
  for (const t of txFiltradas) {
    const dt = new Date(String(t.date || ''));
    if (Number.isNaN(dt.getTime())) continue;
    const m = dt.getMonth();
    if (m < 0 || m > 11) continue;
    if (t.type === 'INCOME') ingresos[m] += Number(t.amount || 0);
    if (t.type === 'EXPENSE') egresos[m] += Number(t.amount || 0);
  }
  const totIng = ingresos.reduce((a,b)=>a+b,0);
  const totEgr = egresos.reduce((a,b)=>a+b,0);
  const SOCIOS_UI = bundle?.socios ?? [];
  const conceptTotals = new Map();
  for (const t of txFiltradas) {
    if (t.type !== 'INCOME') continue;
    let label = 'Otros';
    if (t.invoiceKind === 'MEMBERSHIP') label = 'Cuotas mensuales';
    else if (t.invoiceKind === 'OTHER') label = 'Cobros adicionales';
    else if (t.source === 'STRIPE') label = 'Pagos Stripe';
    else if (t.source === 'BANK_TRANSFER') label = 'Transferencias';
    else if (t.source === 'CASH') label = 'Efectivo';
    else if (t.source === 'MANUAL') label = 'Manual';
    conceptTotals.set(label, (conceptTotals.get(label) ?? 0) + Number(t.amount || 0));
  }
  const palette = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#06B6D4', '#EF4444'];
  const conceptos = Array.from(conceptTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: palette[i % palette.length] }));
  const totalConceptos = conceptos.reduce((a, c) => a + c.value, 0);
  const donutSegments = conceptos.length
    ? conceptos
    : [{ label: 'Sin ingresos', value: 0, color: '#CBD5E1' }];

  const morosos = SOCIOS_UI.filter(s => s.estado === 'Moroso')
  const ratio = totIng > 0 ? Math.round(((totIng - totEgr) / totIng) * 100) : 0

  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--surface)'}}>
      <div style={{maxWidth:1440,margin:'0 auto',padding:'32px 40px 56px',display:'flex',flexDirection:'column',gap:32}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:24,flexWrap:'wrap'}}>
          <div>
            <h1 style={{fontSize:28,fontWeight:700,color:'var(--accent)',letterSpacing:'-0.02em',margin:0,lineHeight:1.1}}>Informes</h1>
            <p style={{color:'var(--text-secondary)',fontSize:14,marginTop:6,margin:0}}>Resumen financiero y operacional del club</p>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} style={{padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'var(--text-primary)',background:'var(--surface-card)'}}/>
            <span style={{fontSize:12,color:'var(--text-muted)'}}>—</span>
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} style={{padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'var(--text-primary)',background:'var(--surface-card)'}}/>
            <button type="button" onClick={() => { setFechaDesde(''); setFechaHasta(''); }} style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,color:'var(--text-secondary)'}}>Limpiar</button>
            <button type="button" onClick={() => { window.location.href = '/api/billing/reports/invoices-csv'; }} style={{
              display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
              borderRadius:8,border:'none',cursor:'pointer',
              background:'var(--accent)',color:'#fff',
              fontFamily:'inherit',fontSize:13,fontWeight:700,
              boxShadow:'0 1px 2px rgba(0,74,198,0.2)',transition:'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
            >
              <Icon name="export" size={15}/>Exportar CSV
            </button>
          </div>
        </div>

        {/* KPI grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',gap:24}}>
          <KPICard label="Ingresos totales" value={fmtMoney(totIng)} sub="En el rango actual" icon="reports" color="var(--green)" badge={totIng > 0 ? { kind:'success', text:'+', icon:'trend_up' } : null}/>
          <KPICard label="Gastos totales" value={fmtMoney(totEgr)} sub={`${txFiltradas.filter(t => t.type === 'EXPENSE').length} movimientos`} icon="billing" color="var(--red)" badge={totEgr > 0 ? { kind:'danger', text:'Salida' } : null}/>
          <KPICard label="Resultado neto" value={fmtMoney(totIng - totEgr)} sub={`Margen ${ratio}%`} icon="dashboard" color="var(--accent-soft)" badge={(totIng - totEgr) >= 0 ? { kind:'success', text:'Positivo', icon:'trend_up' } : { kind:'danger', text:'Negativo', icon:'trend_down' }}/>
          <KPICard label="Socios morosos" value={String(morosos.length)} sub={morosos.length > 0 ? 'Deuda vencida' : 'Sin morosidad'} icon="users" color="var(--amber)" badge={morosos.length > 0 ? { kind:'warning', text:'Atención' } : { kind:'success', text:'OK' }}/>
        </div>

        {/* Bento charts */}
        <div style={{display:'grid',gridTemplateColumns:'minmax(0, 2fr) minmax(0, 1fr)',gap:24}}>
          <div style={{background:'var(--surface-card)',borderRadius:12,padding:32,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
            <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Ingresos y gastos</div>
            <div style={{fontSize:14,color:'var(--text-secondary)',marginTop:4,marginBottom:24}}>Enero — Diciembre {new Date().getFullYear()}</div>
            <BarChart data={ingresos} secondaryData={egresos} labels={meses} color="var(--accent-soft)" secondaryColor="var(--red)" height={200}/>
            <div style={{display:'flex',gap:20,marginTop:16}}>
              <span style={{fontSize:12,display:'flex',alignItems:'center',gap:8,color:'var(--text-secondary)',fontWeight:600}}>
                <span style={{width:10,height:10,borderRadius:3,background:'var(--accent-soft)',display:'inline-block'}}></span>Ingresos
              </span>
              <span style={{fontSize:12,display:'flex',alignItems:'center',gap:8,color:'var(--text-secondary)',fontWeight:600}}>
                <span style={{width:10,height:10,borderRadius:3,background:'var(--red)',display:'inline-block'}}></span>Gastos
              </span>
            </div>
          </div>
          <div style={{background:'var(--surface-card)',borderRadius:12,padding:32,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',display:'flex',flexDirection:'column'}}>
            <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Ingresos por concepto</div>
            <div style={{fontSize:14,color:'var(--text-secondary)',marginTop:4,marginBottom:24}}>Distribución de origen</div>
            <div style={{display:'flex',justifyContent:'center',marginBottom:24,position:'relative'}}>
              <div style={{position:'relative',width:160,height:160}}>
                <DonutChart size={160} segments={donutSegments}/>
                <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
                  <span style={{fontSize:18,fontWeight:700,color:'var(--text-primary)'}}>{fmtMoney(totalConceptos)}</span>
                  <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-muted)',textTransform:'uppercase'}}>Total</span>
                </div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:'auto'}}>
              {conceptos.length === 0 ? (
                <div style={{fontSize:13,color:'var(--text-muted)'}}>Sin ingresos registrados.</div>
              ) : conceptos.map((row) => (
                <div key={row.label} style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{width:10,height:10,borderRadius:'50%',background:row.color,flexShrink:0}}></span>
                  <span style={{fontSize:13,color:'var(--text-primary)',flex:1}}>{row.label}</span>
                  <span style={{fontSize:13,fontWeight:700,color:'var(--text-secondary)'}}>
                    {totalConceptos > 0 ? `${Math.round((row.value / totalConceptos) * 100)}%` : '0%'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Morosos */}
        <div style={{background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)',overflow:'hidden'}}>
          <div style={{padding:'24px 32px',borderBottom:'1px solid var(--border)'}}>
            <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Socios con deuda vencida</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginTop:4}}>{morosos.length} {morosos.length === 1 ? 'socio' : 'socios'} en mora</div>
          </div>
          {morosos.length === 0 ? (
            <div style={{padding:'32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>
              Sin morosidad. Todos los socios al día.
            </div>
          ) : (
            morosos.map((s, i) => (
              <div key={s.id} style={{
                minHeight:64,padding:'16px 32px',display:'flex',alignItems:'center',gap:16,
                borderTop: i === 0 ? 'none' : '1px solid var(--border)'
              }}>
                <Avatar initials={s.avatar} color="var(--red)" size={36}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,color:'var(--text-primary)'}}>{s.nombre}</div>
                  <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{s.deporte} · Vence {new Date(s.vencimiento).toLocaleDateString('es-ES')}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontWeight:700,fontSize:14,color:'var(--red)'}}>{fmtMoney(s.cuota)}</div>
                </div>
                <Badge status="Moroso"/>
                <button type="button" onClick={() => setActive('socios')} style={{padding:'7px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,transition:'all 0.15s'}}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pill)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-card)' }}
                >Ver en socios</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Workflows() {
  const { bundle, reload } = useCrm();
  const role = normalizeRole(bundle?.user?.role)
  if (role !== 'ADMIN') return null
  return <WorkflowsSection bundle={bundle} reload={reload} />;
}

function Personal() {
  const { bundle, reload, showAlert, showConfirm } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  if (role !== 'ADMIN') return null
  const users = (bundle?.users as any[]) ?? []
  const members = (bundle?.socios as any[]) ?? []
  const newsPosts = (bundle?.newsPosts as any[]) ?? []
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'COACH',
    memberId: '',
  })
  const [newsForm, setNewsForm] = useState({
    title: '',
    content: '',
    priority: 'NORMAL',
    isPublished: true,
  })

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    const email = form.email.trim()
    const password = form.password.trim()
    if (!name || !email || !password) {
      showAlert('Nombre, email y contraseña son obligatorios.')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/crm/users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          role: form.role,
          memberId: form.memberId || null,
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        showAlert(j.error || 'No se pudo crear la cuenta')
        return
      }
      setForm({ name: '', email: '', password: '', role: 'COACH', memberId: '' })
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function updateUserRole(userId: string, role: string) {
    setBusy(true)
    try {
      const r = await fetch('/api/crm/users/' + encodeURIComponent(userId), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        showAlert(j.error || 'No se pudo actualizar el rol')
        return
      }
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(userId: string) {
    const ok = await showConfirm('¿Resetear la contraseña de esta cuenta a la contraseña por defecto?')
    if (!ok) return
    setBusy(true)
    try {
      const defaultPassword = '12345678'
      const r = await fetch('/api/crm/users/' + encodeURIComponent(userId), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: defaultPassword }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        showAlert(j.error || 'No se pudo resetear la contraseña')
        return
      }
      showAlert(`Contraseña reseteada. Nueva contraseña: ${defaultPassword}`)
    } finally {
      setBusy(false)
    }
  }

  async function removeUser(userId: string, name: string) {
    const ok = await showConfirm(`¿Eliminar la cuenta "${name}"?`)
    if (!ok) return
    setBusy(true)
    try {
      const r = await fetch('/api/crm/users/' + encodeURIComponent(userId), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        showAlert(j.error || 'No se pudo eliminar la cuenta')
        return
      }
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function createNews(e: React.FormEvent) {
    e.preventDefault()
    const title = newsForm.title.trim()
    const content = newsForm.content.trim()
    if (!title || !content) {
      showAlert('Título y contenido son obligatorios.')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/crm/news', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newsForm),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        showAlert(j.error || 'No se pudo crear la noticia')
        return
      }
      setNewsForm({ title: '', content: '', priority: 'NORMAL', isPublished: true })
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function togglePublish(post: any) {
    setBusy(true)
    try {
      const r = await fetch('/api/crm/news/' + encodeURIComponent(post.id), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !post.isPublished }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        showAlert(j.error || 'No se pudo actualizar la noticia')
        return
      }
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function removeNews(post: any) {
    const ok = await showConfirm(`¿Eliminar la noticia "${post.title}"?`)
    if (!ok) return
    setBusy(true)
    try {
      const r = await fetch('/api/crm/news/' + encodeURIComponent(post.id), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        showAlert(j.error || 'No se pudo eliminar la noticia')
        return
      }
      await reload()
    } finally {
      setBusy(false)
    }
  }

  // KPIs Personal
  const numAdmins = users.filter((u: any) => u.role === 'ADMIN').length
  const numCoaches = users.filter((u: any) => u.role === 'COACH').length
  const numTreasurers = users.filter((u: any) => u.role === 'TREASURER').length
  const numPublishedNews = newsPosts.filter((n: any) => n.isPublished).length
  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 13, marginBottom: 10, color: 'var(--text-primary)', background: 'var(--surface-card)', outline: 'none' as const }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 40px 56px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* Header */}
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>Personal</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 6, margin: 0 }}>Cuentas, roles y comunicación interna del club</p>
        </div>

        {/* KPI grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
          <KPICard label="Total cuentas" value={String(users.length)} sub="Personal con acceso" icon="users" color="var(--accent-soft)" badge={{ kind: 'info', text: 'Total' }}/>
          <KPICard label="Administradores" value={String(numAdmins)} sub="Acceso completo" icon="users" color="var(--accent)" badge={{ kind: 'info', text: 'Admin' }}/>
          <KPICard label="Entrenadores" value={String(numCoaches)} sub="Equipos y eventos" icon="teams" color="var(--green)"/>
          <KPICard label="Tesoreros" value={String(numTreasurers)} sub="Contabilidad y cobros" icon="billing" color="var(--amber)"/>
        </div>

        {/* Forms: Crear cuenta + publicar noticia */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <form onSubmit={createUser} style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, boxShadow: 'var(--card-shadow)' }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 6 }}>Crear cuenta de personal</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Asigna rol y, opcionalmente, vincula a un socio existente.</div>
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre" style={inputStyle} />
            <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" type="email" style={inputStyle} />
            <input value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder="Contraseña inicial" type="password" style={inputStyle} />
            <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} style={inputStyle}>
              <option value="COACH">Entrenador</option>
              <option value="TREASURER">Tesorero</option>
              <option value="ADMIN">Administrador</option>
            </select>
            <select value={form.memberId} onChange={(e) => setForm((p) => ({ ...p, memberId: e.target.value }))} style={{ ...inputStyle, marginBottom: 16 }}>
              <option value="">Sin socio vinculado</option>
              {members.map((m: any) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
            <button type="submit" disabled={busy} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', boxShadow: '0 1px 2px rgba(0,74,198,0.2)' }}>
              Crear cuenta
            </button>
          </form>

          <form onSubmit={createNews} style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, boxShadow: 'var(--card-shadow)' }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginBottom: 6 }}>Publicar noticia</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Aparecerá en el mural de socios cuando esté publicada.</div>
            <input value={newsForm.title} onChange={(e) => setNewsForm((p) => ({ ...p, title: e.target.value }))} placeholder="Título" style={inputStyle} />
            <textarea value={newsForm.content} onChange={(e) => setNewsForm((p) => ({ ...p, content: e.target.value }))} rows={5} placeholder="Contenido de la noticia" style={{ ...inputStyle, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
              <select value={newsForm.priority} onChange={(e) => setNewsForm((p) => ({ ...p, priority: e.target.value }))} style={{ ...inputStyle, marginBottom: 0, flex: 1 }}>
                <option value="NORMAL">Prioridad normal</option>
                <option value="HIGH">Prioridad alta</option>
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                <input type="checkbox" checked={newsForm.isPublished} onChange={(e) => setNewsForm((p) => ({ ...p, isPublished: e.target.checked }))} />
                Publicada
              </label>
            </div>
            <button type="submit" disabled={busy} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer', boxShadow: '0 1px 2px rgba(0,74,198,0.2)' }}>
              Guardar noticia
            </button>
          </form>
        </div>

        {/* Tabla cuentas */}
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--card-shadow)', overflow: 'hidden' }}>
          <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Cuentas de acceso</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{users.length} {users.length === 1 ? 'cuenta' : 'cuentas'} registradas</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-low)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 32px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nombre</th>
                  <th style={{ textAlign: 'left', padding: '12px 32px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '12px 32px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rol</th>
                  <th style={{ textAlign: 'left', padding: '12px 32px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Socio vinculado</th>
                  <th style={{ textAlign: 'left', padding: '12px 32px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '16px 32px', fontWeight: 600, color: 'var(--text-primary)' }}>{u.name || '—'}</td>
                    <td style={{ padding: '16px 32px', color: 'var(--text-secondary)' }}>{u.email || '—'}</td>
                    <td style={{ padding: '16px 32px' }}>
                      <select value={u.role} onChange={(e) => updateUserRole(u.id, e.target.value)} disabled={busy} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', background: 'var(--surface-card)' }}>
                        <option value="ADMIN">ADMIN</option>
                        <option value="COACH">COACH</option>
                        <option value="TREASURER">TREASURER</option>
                        <option value="MEMBER">MEMBER</option>
                      </select>
                    </td>
                    <td style={{ padding: '16px 32px', color: 'var(--text-secondary)' }}>{u.memberName || '—'}</td>
                    <td style={{ padding: '16px 32px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => resetPassword(u.id)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-card)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Reset password</button>
                      <button type="button" onClick={() => removeUser(u.id, u.name || u.email || u.id)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--red)', background: 'var(--surface-card)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>Eliminar</button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Sin cuentas registradas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mural noticias */}
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--card-shadow)', overflow: 'hidden' }}>
          <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Mural de noticias</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{newsPosts.length} {newsPosts.length === 1 ? 'publicación' : 'publicaciones'} · {numPublishedNews} {numPublishedNews === 1 ? 'visible' : 'visibles'} para socios</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {newsPosts.map((post: any) => (
              <div key={post.id} style={{ borderTop: '1px solid var(--border)', padding: '20px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{post.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 10px', background: post.priority === 'HIGH' ? 'var(--red-soft)' : 'var(--surface-low)', color: post.priority === 'HIGH' ? 'var(--red)' : 'var(--text-secondary)', letterSpacing: '0.02em' }}>
                    {post.priority === 'HIGH' ? 'Alta' : 'Normal'}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 10px', background: post.isPublished ? 'var(--green-soft)' : 'var(--surface-low)', color: post.isPublished ? 'var(--green)' : 'var(--text-muted)', letterSpacing: '0.02em' }}>{post.isPublished ? 'Publicada' : 'Borrador'}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{post.content}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {post.authorName || '—'} · {post.createdAt ? new Date(post.createdAt).toLocaleString('es-ES') : '—'}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => togglePublish(post)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-card)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {post.isPublished ? 'Despublicar' : 'Publicar'}
                    </button>
                    <button type="button" onClick={() => removeNews(post)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--red)', background: 'var(--surface-card)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {newsPosts.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>No hay noticias aún.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function normalizePhoneE164(raw: string) {
  const only = String(raw || '').replace(/[^\d+]/g, '')
  if (!only) return ''
  if (only.startsWith('+')) return only.slice(1)
  return only
}

function WhatsAppSection() {
  const { showAlert, reload, bundle } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  if (role !== 'ADMIN') return null
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState<any | null>(null)
  const [activeSessionId, setActiveSessionId] = useState('')
  const [status, setStatus] = useState('—')
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [createSessionId, setCreateSessionId] = useState('')
  const [sendPhone, setSendPhone] = useState('')
  const [sendMessage, setSendMessage] = useState('')

  const loadAll = useCallback(async (preferredSessionId?: string) => {
    setBusy(true)
    try {
      const sR = await fetch('/api/crm/whatsapp/sessions', { credentials: 'include' })
      const sJ = sR.ok ? await sR.json() : { sessions: [] }
      const list = Array.isArray(sJ.sessions) ? sJ.sessions : []
      const one = list[0] || null
      setSession(one)
      const next = preferredSessionId || activeSessionId || one?.id || ''
      setActiveSessionId(next)
      if (!next) {
        setStatus('SIN_SESION')
        setQrImage(null)
        setLogs([])
        return
      }

      const [stR, qrR, lR] = await Promise.all([
        fetch('/api/crm/whatsapp/sessions/' + encodeURIComponent(next) + '/status', { credentials: 'include' }),
        fetch('/api/crm/whatsapp/sessions/' + encodeURIComponent(next) + '/qr', { credentials: 'include' }),
        fetch('/api/crm/whatsapp/sessions/' + encodeURIComponent(next) + '/logs', { credentials: 'include' }),
      ])
      const stJ = stR.ok ? await stR.json() : {}
      const qrJ = qrR.ok ? await qrR.json() : {}
      const lJ = lR.ok ? await lR.json() : {}
      setStatus(String(stJ.status || stJ.state || 'UNKNOWN'))
      setQrImage((typeof qrJ.qrImage === 'string' && qrJ.qrImage) || null)
      setLogs(Array.isArray(lJ.logs) ? lJ.logs : [])
    } finally {
      setBusy(false)
    }
  }, [activeSessionId])

  useEffect(() => {
    loadAll().catch(() => {})
  }, [loadAll])

  useEffect(() => {
    if (!activeSessionId) return
    const poll = window.setInterval(() => {
      loadAll(activeSessionId).catch(() => {})
    }, 4000)
    return () => window.clearInterval(poll)
  }, [activeSessionId, loadAll])

  async function createSession() {
    const id = createSessionId.trim()
    if (!id) {
      showAlert('Indica un Session ID para crear la conexión.')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/crm/whatsapp/sessions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, type: 'standard' }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        showAlert(j.error || 'No se pudo crear la sesión de WhatsApp')
        return
      }
      setCreateSessionId('')
      await reload()
      await loadAll(id)
    } finally {
      setBusy(false)
    }
  }

  async function runSessionAction(action: 'restart' | 'delete') {
    if (!activeSessionId) {
      showAlert('Selecciona una sesión primero.')
      return
    }
    setBusy(true)
    try {
      const url =
        action === 'restart'
          ? '/api/crm/whatsapp/sessions/' + encodeURIComponent(activeSessionId) + '/restart'
          : '/api/crm/whatsapp/sessions/' + encodeURIComponent(activeSessionId)
      const method = action === 'restart' ? 'POST' : 'DELETE'
      const r = await fetch(url, { method, credentials: 'include' })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        showAlert(j.error || 'No se pudo ejecutar la acción sobre la sesión')
        return
      }
      await loadAll(action === 'delete' ? '' : activeSessionId)
    } finally {
      setBusy(false)
    }
  }

  async function sendTextMessage(e: React.FormEvent) {
    e.preventDefault()
    const phone = normalizePhoneE164(sendPhone)
    const message = sendMessage.trim()
    if (!phone || !message) {
      showAlert('Completa teléfono y mensaje.')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/crm/whatsapp/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        showAlert(j.error || 'No se pudo enviar el mensaje de WhatsApp')
        return
      }
      setSendMessage('')
      await loadAll(activeSessionId)
    } finally {
      setBusy(false)
    }
  }

  const statusColor = status === 'READY' ? 'var(--green)' : status === 'QR_READY' ? 'var(--amber)' : 'var(--text-muted)'
  const statusBg = status === 'READY' ? 'var(--green-soft)' : status === 'QR_READY' ? 'var(--amber-soft)' : 'var(--surface-low)'
  const inputStyle = { width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)', fontFamily:'inherit', fontSize:13, color:'var(--text-primary)', background:'var(--surface-card)', outline:'none' as const }

  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--surface)'}}>
      <div style={{maxWidth:1440,margin:'0 auto',padding:'32px 40px 56px',display:'flex',flexDirection:'column',gap:32}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:24,flexWrap:'wrap'}}>
          <div>
            <h1 style={{fontSize:28,fontWeight:700,color:'var(--accent)',letterSpacing:'-0.02em',margin:0,lineHeight:1.1}}>WhatsApp</h1>
            <p style={{color:'var(--text-secondary)',fontSize:14,marginTop:6,margin:0}}>Conexión ApiWass y envío integrado con el CRM</p>
          </div>
          <span style={{
            display:'inline-flex',alignItems:'center',gap:8,padding:'7px 14px',borderRadius:999,
            background:statusBg,color:statusColor,fontSize:12,fontWeight:700,letterSpacing:'0.04em'
          }}>
            <span style={{width:8,height:8,borderRadius:'50%',background:statusColor}}/>
            Estado: {status}
          </span>
        </div>

        {/* KPI grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',gap:24}}>
          <KPICard label="Sesión activa" value={session ? '1' : '0'} sub={session?.id || 'Sin sesión vinculada'} icon="dashboard" color="var(--green)" badge={session ? { kind:'success', text:'Conectado' } : { kind:'warning', text:'Sin conexión' }}/>
          <KPICard label="Estado" value={status === 'READY' ? 'Listo' : status === 'QR_READY' ? 'QR' : status} sub={status === 'READY' ? 'Puede enviar mensajes' : status === 'QR_READY' ? 'Escanea el QR' : 'Sin estado'} icon="bell" color="var(--accent-soft)" badge={status === 'READY' ? { kind:'success', text:'OK' } : { kind:'warning', text:'Atención' }}/>
          <KPICard label="Logs recientes" value={String(logs.length)} sub="Eventos registrados" icon="reports" color="var(--amber)"/>
        </div>

        {/* Bento: Sesión + QR */}
        <div style={{display:'grid',gridTemplateColumns:'minmax(0, 1.2fr) minmax(0, 1fr)',gap:24}}>
          <div style={{background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:12,padding:24,boxShadow:'var(--card-shadow)'}}>
            <div style={{fontWeight:600,fontSize:16,color:'var(--text-primary)',letterSpacing:'-0.01em',marginBottom:6}}>Sesión vinculada al CRM</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>Solo se mantiene una sesión activa por club.</div>
            <div style={{display:'flex',gap:8,marginBottom:14}}>
              <input value={createSessionId} onChange={(e)=>setCreateSessionId(e.target.value)} placeholder="session-id-crm" style={{...inputStyle,flex:1}} />
              <button type="button" onClick={createSession} disabled={busy || !!session} style={{
                padding:'10px 16px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',
                fontFamily:'inherit',fontWeight:700,fontSize:13,
                cursor: busy ? 'not-allowed' : 'pointer',opacity:(busy || !!session)?0.7:1,
                boxShadow:'0 1px 2px rgba(0,74,198,0.2)'
              }}>Crear sesión</button>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center',padding:'12px 14px',borderRadius:10,border:'1px solid var(--border)',background:'var(--surface-low)'}}>
              <span style={{fontSize:13,color:'var(--text-primary)',fontWeight:600,flex:1}}>
                {session ? `${session.id}` : 'Sin sesión vinculada'}
              </span>
              {session && (
                <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:999,background:statusBg,color:statusColor,letterSpacing:'0.02em'}}>
                  {session.status || session.state || 'UNKNOWN'}
                </span>
              )}
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button type="button" onClick={() => runSessionAction('restart')} disabled={busy || !activeSessionId} style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',fontFamily:'inherit',fontSize:12,fontWeight:700,color:'var(--text-primary)',cursor:busy?'not-allowed':'pointer'}}>Reiniciar</button>
              <button type="button" onClick={() => runSessionAction('delete')} disabled={busy || !activeSessionId} style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--red)',fontFamily:'inherit',fontSize:12,fontWeight:700,cursor:busy?'not-allowed':'pointer'}}>Eliminar</button>
            </div>
          </div>

          <div style={{background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:12,padding:24,boxShadow:'var(--card-shadow)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:240,gap:14}}>
            <div style={{fontWeight:600,fontSize:14,color:'var(--text-primary)',alignSelf:'flex-start'}}>QR de vinculación</div>
            {qrImage ? (
              <img
                src={qrImage}
                alt="QR WhatsApp"
                style={{
                  width: 220, height: 220, maxWidth: '100%',
                  objectFit: 'contain', imageRendering: 'pixelated',
                  borderRadius: 10, border: '1px solid var(--border)', background: '#fff', padding: 6
                }}
              />
            ) : (
              <div style={{fontSize:12,color:'var(--text-muted)',textAlign:'center',padding:'20px 0'}}>
                Sin QR disponible.<br/>Si el estado es <b>READY</b> no hace falta escanear.
              </div>
            )}
          </div>
        </div>

        {/* Enviar + Logs */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
          <form onSubmit={sendTextMessage} style={{background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:12,padding:24,boxShadow:'var(--card-shadow)'}}>
            <div style={{fontWeight:600,fontSize:16,color:'var(--text-primary)',letterSpacing:'-0.01em',marginBottom:6}}>Enviar mensaje manual</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>Envío directo a un número desde el CRM.</div>
            <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:6,letterSpacing:'0.02em'}}>Teléfono (E.164 sin +)</label>
            <input value={sendPhone} onChange={(e)=>setSendPhone(e.target.value)} placeholder="34666777888" style={{...inputStyle,marginBottom:14}} />
            <label style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:6,letterSpacing:'0.02em'}}>Mensaje</label>
            <textarea value={sendMessage} onChange={(e)=>setSendMessage(e.target.value)} rows={4} placeholder="Hola, este mensaje sale desde Furvoley CRM." style={{...inputStyle,marginBottom:14,resize:'vertical'}} />
            <button type="submit" disabled={busy || !activeSessionId} style={{padding:'10px 18px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',fontFamily:'inherit',fontWeight:700,fontSize:13,cursor:busy?'not-allowed':'pointer',boxShadow:'0 1px 2px rgba(0,74,198,0.2)'}}>Enviar WhatsApp</button>
          </form>

          <div style={{background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:12,padding:24,boxShadow:'var(--card-shadow)'}}>
            <div style={{fontWeight:600,fontSize:16,color:'var(--text-primary)',letterSpacing:'-0.01em',marginBottom:6}}>Logs de sesión</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>Últimos eventos de la integración.</div>
            <div style={{maxHeight:240,overflowY:'auto',display:'flex',flexDirection:'column',gap:6}}>
              {logs.length === 0 ? (
                <div style={{fontSize:13,color:'var(--text-muted)'}}>Sin logs recientes.</div>
              ) : logs.slice(0, 80).map((l:any, i:number) => (
                <div key={i} style={{fontSize:12,color:'var(--text-secondary)',padding:'8px 10px',border:'1px solid var(--border)',borderRadius:8,background:'var(--surface-low)',fontFamily:'ui-monospace, SFMono-Regular, monospace'}}>
                  {typeof l === 'string' ? l : JSON.stringify(l)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── APP ROOT ─────────────────────────────────────────────────────────────────
const CRM_SECTION_IDS = ['dashboard','socios','equipos','contabilidad','calendario','informes','workflows','whatsapp','personal'] as const;
type SectionId = (typeof CRM_SECTION_IDS)[number]

const SECTION_TITLES: Record<SectionId, string> = {
  dashboard: 'Inicio',
  socios: 'Socios',
  equipos: 'Equipos',
  contabilidad: 'Contabilidad',
  calendario: 'Calendario',
  informes: 'Informes',
  workflows: 'Flujos',
  whatsapp: 'WhatsApp',
  personal: 'Personal',
}

function CrmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { loading, error, bundle } = useCrm()
  const [showNotifications, setShowNotifications] = useState(false)
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([])
  const [showClubSettings, setShowClubSettings] = useState(false)

  const tabRaw = searchParams.get('tab') ?? ''
  const normalizedTab = tabRaw === 'cobros' ? 'contabilidad' : tabRaw
  // Debe declararse antes de cualquier hook que liste `role` en dependencias
  // (evita ReferenceError: Cannot access ... before initialization en SSR/client).
  const role = normalizeRole(bundle?.user?.role)

  // Si volvemos del onboarding de Stripe Connect (?stripeConnect=connected|refresh)
  // abrimos automáticamente el modal en la pestaña Suscripción y limpiamos el query.
  useEffect(() => {
    const sc = searchParams.get('stripeConnect')
    if (!sc) return
    if (role === 'ADMIN') {
      setShowClubSettings(true)
    }
    const params = new URLSearchParams(searchParams.toString())
    params.delete('stripeConnect')
    const qs = params.toString()
    router.replace(qs ? `/?${qs}` : '/', { scroll: false })
  }, [searchParams, router, role])
  const active: SectionId = CRM_SECTION_IDS.includes(normalizedTab as SectionId)
    ? (normalizedTab as SectionId)
    : 'dashboard'
  const firstAllowed = (CRM_SECTION_IDS.find((id) => canAccessCrmSection(role, id)) || 'dashboard') as SectionId
  const safeActive = canAccessCrmSection(role, active) ? active : firstAllowed

  useEffect(() => {
    const tRaw = searchParams.get('tab')
    const t = tRaw === 'cobros' ? 'contabilidad' : tRaw
    if (!t || !CRM_SECTION_IDS.includes(t as SectionId)) {
      router.replace(`/?tab=${firstAllowed}`, { scroll: false })
      return
    }
    if (!canAccessCrmSection(role, t as SectionId)) {
      router.replace(`/?tab=${firstAllowed}`, { scroll: false })
      return
    }
    if (tRaw === 'cobros') {
      router.replace('/?tab=contabilidad', { scroll: false })
    }
  }, [router, searchParams, role, firstAllowed])

  const setActive = useCallback(
    (id: string) => {
      if (!CRM_SECTION_IDS.includes(id as SectionId)) return
      if (!canAccessCrmSection(role, id as SectionId)) return
      router.replace(`/?tab=${encodeURIComponent(id)}`, { scroll: false })
    },
    [router, role]
  )

  const notifications = useMemo(() => {
    const out = [] as {
      id: string
      title: string
      description: string
      tab: SectionId
      priority: 'high' | 'normal'
    }[]

    const cobros = Array.isArray(bundle?.cobros) ? bundle.cobros : []
    const eventos = Array.isArray(bundle?.eventos) ? bundle.eventos : []
    const socios = Array.isArray(bundle?.socios) ? bundle.socios : []
    const now = new Date()
    const addDays = (d: Date, days: number) => {
      const x = new Date(d)
      x.setDate(x.getDate() + days)
      return x
    }
    const inThreeDays = addDays(now, 3)
    const inSevenDays = addDays(now, 7)
    const tomorrowStart = new Date(now)
    tomorrowStart.setDate(tomorrowStart.getDate() + 1)
    tomorrowStart.setHours(0, 0, 0, 0)
    const tomorrowEnd = new Date(tomorrowStart)
    tomorrowEnd.setHours(23, 59, 59, 999)
    const thirtyDaysAgo = addDays(now, -30)

    for (const c of cobros) {
      if (c?.estado === 'Vencido') {
        out.push({
          id: `overdue-${c.id}`,
          title: 'Cobro vencido',
          description: `${c.socio} · ${c.concepto}`,
          tab: 'contabilidad',
          priority: 'high',
        })
      }
    }

    const membersWithOverdue = new Map<string, number>()
    for (const c of cobros) {
      if (c?.estado !== 'Vencido' || !c?.memberId) continue
      const prev = membersWithOverdue.get(c.memberId) || 0
      membersWithOverdue.set(c.memberId, prev + 1)
    }
    for (const [memberId, count] of membersWithOverdue.entries()) {
      const socio = socios.find((s) => s.id === memberId)
      out.push({
        id: `member-overdue-${memberId}`,
        title: 'Socio con mensualidad impagada',
        description: `${socio?.nombre || 'Socio'} · ${count} cuota(s) vencida(s)`,
        tab: 'socios',
        priority: 'high',
      })
    }

    for (const c of cobros) {
      if (c?.estado !== 'Pendiente') continue
      const due = new Date(String(c.vencimiento || ''))
      if (Number.isNaN(due.getTime())) continue
      if (due >= now && due <= inThreeDays) {
        out.push({
          id: `due-soon-${c.id}`,
          title: 'Cobro por vencer',
          description: `${c.socio} · vence ${due.toLocaleDateString('es-AR')}`,
          tab: 'contabilidad',
          priority: 'normal',
        })
      }
    }

    for (const e of eventos) {
      const eventDate = new Date(String(e.fecha || ''))
      if (Number.isNaN(eventDate.getTime())) continue
      if (eventDate >= tomorrowStart && eventDate <= tomorrowEnd) {
        out.push({
          id: `event-tomorrow-${e.id}`,
          title: 'Evento mañana',
          description: `${e.titulo} · ${eventDate.toLocaleDateString('es-AR')}`,
          tab: 'calendario',
          priority: 'high',
        })
      }
      if (eventDate >= now && eventDate <= inSevenDays) {
        out.push({
          id: `event-${e.id}`,
          title: 'Evento próximo',
          description: `${e.titulo} · ${eventDate.toLocaleDateString('es-AR')}`,
          tab: 'calendario',
          priority: 'normal',
        })
      }
    }

    for (const c of cobros) {
      if (c?.estado !== 'Pendiente') continue
      const reg = new Date(String(c.registro || ''))
      if (Number.isNaN(reg.getTime())) continue
      if (reg < thirtyDaysAgo) {
        out.push({
          id: `stale-pending-${c.id}`,
          title: 'Cobro pendiente antiguo',
          description: `${c.socio} · pendiente desde ${reg.toLocaleDateString('es-AR')}`,
          tab: 'contabilidad',
          priority: 'normal',
        })
      }
    }

    return out
      .filter((n) => !dismissedNotificationIds.includes(n.id))
      .sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1))
      .slice(0, 20)
  }, [bundle, dismissedNotificationIds])

  const unreadCount = notifications.length

  useEffect(() => {
    if (!showNotifications || notifications.length === 0) return
    const ids = notifications.map((n) => n.id)
    const key = 'crm_notifications_seen'
    try {
      const raw = localStorage.getItem(key)
      const seen = raw ? (JSON.parse(raw) as string[]) : []
      const merged = Array.from(new Set([...seen, ...ids]))
      localStorage.setItem(key, JSON.stringify(merged.slice(-500)))
      setDismissedNotificationIds((prev) => Array.from(new Set([...prev, ...ids])))
    } catch {
      //
    }
  }, [showNotifications, notifications])

  useEffect(() => {
    const key = 'crm_notifications_seen'
    try {
      const raw = localStorage.getItem(key)
      const seen = raw ? (JSON.parse(raw) as string[]) : []
      setDismissedNotificationIds(Array.isArray(seen) ? seen : [])
    } catch {
      setDismissedNotificationIds([])
    }
  }, [])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const el = e.target as HTMLElement | null
      if (!el?.closest?.('[data-crm-notifications]')) setShowNotifications(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const screens = {
    dashboard: Dashboard,
    socios: Socios,
    equipos: Equipos,
    contabilidad: Contabilidad,
    calendario: Calendario,
    informes: Informes,
    workflows: Workflows,
    whatsapp: WhatsAppSection,
    personal: Personal,
  };
  const Screen = screens[safeActive] || Dashboard;

  const todayStr = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const topDateStr = todayStr.charAt(0).toUpperCase() + todayStr.slice(1)

  if (error) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',padding:24,flexDirection:'column',gap:12}}>
        <p style={{color:'#b91c1c',fontWeight:600}}>{error}</p>
        <button type="button" onClick={() => window.location.href = '/login'} style={{padding:'10px 18px',borderRadius:10,border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Ir al login</button>
      </div>
    );
  }

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',position:'relative',background:'var(--surface)'}}>
      {loading && (
        <div style={{position:'absolute',inset:0,background:'rgba(248,249,255,0.85)',backdropFilter:'blur(4px)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:600,color:'var(--text-secondary)'}}>
          Cargando CRM…
        </div>
      )}
      <Sidebar
        active={safeActive}
        setActive={setActive}
        onOpenClubSettings={role === 'ADMIN' ? () => setShowClubSettings(true) : undefined}
      />
      <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',minWidth:0,background:'var(--surface)'}}>
        <div style={{
          height:72,background:'var(--surface-card)',
          borderBottom:'1px solid var(--border)',
          display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'0 40px',gap:24,flexShrink:0,
          position:'sticky',top:0,zIndex:10,
        }}>
          {/* Section title + date */}
          <div style={{display:'flex',alignItems:'center',gap:16,minWidth:0}}>
            <h2 style={{
              fontSize:24,fontWeight:600,letterSpacing:'-0.01em',
              color:'var(--text-primary)',margin:0,lineHeight:1.2,
              whiteSpace:'nowrap'
            }}>{SECTION_TITLES[safeActive] || 'Inicio'}</h2>
            <span style={{width:1,height:20,background:'var(--border)'}}></span>
            <span style={{
              fontSize:13,color:'var(--text-secondary)',
              textTransform:'capitalize',whiteSpace:'nowrap',
              overflow:'hidden',textOverflow:'ellipsis'
            }}>{topDateStr}</span>
          </div>

          {/* Right cluster: search + actions + user */}
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <div style={{position:'relative',display:'none'}} className="crm-topbar-search">
              {/* Search reserved for future */}
            </div>
            {(safeActive === 'dashboard' && role === 'ADMIN') && (
              <button
                type="button"
                onClick={() => { window.location.href = '/api/billing/reports/invoices-csv'; }}
                title="Exportar facturas (CSV)"
                style={{
                  display:'flex',alignItems:'center',gap:8,
                  padding:'9px 18px',borderRadius:8,border:'none',cursor:'pointer',
                  background:'var(--accent)',color:'#fff',
                  fontFamily:'inherit',fontSize:13,fontWeight:600,
                  boxShadow:'0 1px 2px rgba(0,74,198,0.2)',
                  transition:'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
              >
                <Icon name="export" size={16}/>
                <span>Exportar</span>
              </button>
            )}

            <div data-crm-notifications style={{position:'relative'}}>
              <button
                type="button"
                title="Notificaciones"
                aria-label="Notificaciones"
                onClick={() => setShowNotifications((v) => !v)}
                style={{
                  position:'relative',
                  width:40,height:40,borderRadius:'50%',
                  border:'none',background:'transparent',
                  cursor:'pointer',color:'var(--text-secondary)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  transition:'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-low)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <Icon name="bell" size={20}/>
                {unreadCount > 0 && (
                  <span style={{position:'absolute',top:8,right:8,width:8,height:8,borderRadius:'50%',background:'var(--red)',border:'2px solid var(--surface-card)'}}></span>
                )}
              </button>
          {showNotifications && (
            <div style={{
              position:'absolute',
              top:42,
              right:0,
              width:320,
              maxHeight:360,
              overflowY:'auto',
              background:'#fff',
              border:'1px solid var(--border)',
              borderRadius:12,
              boxShadow:'0 12px 28px rgba(15,23,42,0.14)',
              zIndex:300,
            }}>
              <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:13,fontWeight:700,color:'#111827'}}>Notificaciones</span>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:12,color:'#6b7280'}}>{unreadCount}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDismissedNotificationIds([])
                      try {
                        localStorage.removeItem('crm_notifications_seen')
                      } catch {
                        //
                      }
                    }}
                    style={{border:'none',background:'transparent',color:'#4f46e5',cursor:'pointer',fontSize:11,fontWeight:700,padding:0}}
                  >
                    Ver todas
                  </button>
                </div>
              </div>
              {notifications.length === 0 ? (
                <div style={{padding:'14px 12px',fontSize:13,color:'#6b7280'}}>No hay novedades ahora mismo.</div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setShowNotifications(false)
                      setActive(n.tab)
                    }}
                    style={{
                      width:'100%',
                      border:'none',
                      borderBottom:'1px solid var(--border)',
                      background:'#fff',
                      textAlign:'left',
                      padding:'10px 12px',
                      cursor:'pointer',
                      fontFamily:'inherit',
                    }}
                  >
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{width:7,height:7,borderRadius:'50%',background:n.priority === 'high' ? 'var(--red)' : '#94a3b8',flexShrink:0}}></span>
                      <span style={{fontSize:13,fontWeight:600,color:'#111827'}}>{n.title}</span>
                    </div>
                    <div style={{fontSize:12,color:'#6b7280',marginTop:4,paddingLeft:15}}>{n.description}</div>
                  </button>
                ))
              )}
            </div>
          )}
          </div>
            <button
              type="button"
              onClick={role === 'ADMIN' ? () => setShowClubSettings(true) : undefined}
              disabled={role !== 'ADMIN'}
              title={role === 'ADMIN' ? 'Configuración del club' : undefined}
              style={{
                display:'flex',alignItems:'center',gap:10,
                paddingLeft:16,marginLeft:4,borderLeft:'1px solid var(--border)',
                background:'transparent',border:'none',
                cursor: role === 'ADMIN' ? 'pointer' : 'default',
                fontFamily:'inherit',padding:'4px 0 4px 16px',
                borderRadius:0,
              }}
            >
              <div style={{
                display:'flex',flexDirection:'column',alignItems:'flex-end',lineHeight:1.2
              }} className="crm-topbar-user-text">
                <span style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{bundle?.user?.name || 'Administrador'}</span>
                <span style={{
                  fontSize:10,fontWeight:700,color:'var(--accent)',
                  background:'var(--accent-pill)',padding:'2px 8px',borderRadius:999,
                  letterSpacing:'0.06em',textTransform:'uppercase',marginTop:2
                }}>{ROLE_LABEL[role] || 'Socio'}</span>
              </div>
              <div style={{
                width:40,height:40,borderRadius:'50%',
                background:'linear-gradient(135deg, #2563eb, #004ac6)',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:14,fontWeight:700,color:'#fff',
                boxShadow:'0 2px 8px rgba(0,74,198,0.2)',
                border:'2px solid var(--surface-card)'
              }}>{bundle?.user?.initials || '—'}</div>
            </button>
          </div>
        </div>
        <div style={{flex:1,overflow:'hidden',display:'flex',minWidth:0}}>
          <Screen setActive={setActive}/>
        </div>
      </div>
      {role === 'ADMIN' && (
        <ClubSettingsModal
          open={showClubSettings}
          onClose={() => setShowClubSettings(false)}
          initialUser={{
            name: bundle?.user?.name,
            email: bundle?.user?.email,
            role: bundle?.user?.role,
            initials: bundle?.user?.initials,
          }}
        />
      )}
    </div>
  );
}

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

export default function CrmApp() {
  return (
    <div
      className={`${plusJakarta.className} min-h-screen w-full`}
      style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}
    >
      <CrmProvider>
        <CrmInner />
      </CrmProvider>
    </div>
  )
}

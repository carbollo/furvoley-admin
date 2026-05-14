// @ts-nocheck
'use client'

import { WorkflowsSection } from './WorkflowsSection'
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
    const r = await fetch('/api/crm/data', { credentials: 'include' });
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

const KPICard = ({ label, value, sub, icon, color, trend, chart }) => (
  <div style={{
    background:'#fff',borderRadius:16,padding:'20px 24px',
    boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',
    display:'flex',flexDirection:'column',gap:12,flex:1,minWidth:0
  }}>
    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
      <div style={{display:'flex',flexDirection:'column',gap:4}}>
        <span style={{fontSize:13,color:'#6b7280',fontWeight:500}}>{label}</span>
        <span style={{fontSize:28,fontWeight:800,letterSpacing:'-0.5px',color:'#111827'}}>{value}</span>
      </div>
      <div style={{
        width:40,height:40,borderRadius:12,
        background:`${color}15`,color,
        display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0
      }}>
        <Icon name={icon} size={20}/>
      </div>
    </div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <span style={{fontSize:12,color:trend?.up ? 'var(--green)' : '#6b7280',display:'flex',alignItems:'center',gap:4}}>
        {trend && <Icon name={trend.up ? 'trend_up' : 'trend_down'} size={13}/>}
        {sub}
      </span>
      {chart && <MiniLineChart data={chart} color={color} width={80} height={32}/>}
    </div>
  </div>
);

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
];

function Sidebar({ active, setActive }) {
  const { bundle } = useCrm();
  const pending = bundle?.kpis?.cobrosPendientes ?? 0;
  return (
    <div className="sidebar" style={{
      width:220,background:'var(--sidebar-bg)',display:'flex',flexDirection:'column',
      flexShrink:0,height:'100vh',overflow:'hidden',transition:'width 0.2s'
    }}>
      {/* Logo */}
      <div style={{padding:'24px 20px 20px',borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{
            width:34,height:34,borderRadius:10,
            background:'linear-gradient(135deg, #3B82F6, #8B5CF6)',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:16,fontWeight:800,color:'#fff',flexShrink:0
          }}>F</div>
          <div>
            <div className="sidebar-logo-text" style={{color:'#fff',fontWeight:700,fontSize:14,lineHeight:1.2}}>Furvoley</div>
            <div className="sidebar-logo-text" style={{color:'rgba(255,255,255,0.4)',fontSize:11}}>Club Multideporte</div>
          </div>
        </div>
      </div>
      {/* User */}
      <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{
            width:32,height:32,borderRadius:'50%',
            background:'linear-gradient(135deg, #3B82F6, #8B5CF6)',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:13,fontWeight:700,color:'#fff',flexShrink:0
          }}>{bundle?.user?.initials || '—'}</div>
          <div>
            <div style={{color:'#fff',fontWeight:600,fontSize:13}}>{bundle?.user?.name || 'Administrador'}</div>
            <div style={{
              display:'inline-block',background:'rgba(99,102,241,0.3)',
              color:'#a5b4fc',fontSize:9,fontWeight:700,padding:'1px 7px',
              borderRadius:999,letterSpacing:1
            }}>{({ ADMIN: 'Administrador', MEMBER: 'Socio' }[bundle?.user?.role] ?? bundle?.user?.role) || 'Administrador'}</div>
          </div>
        </div>
      </div>
      {/* Nav */}
      <nav style={{flex:1,padding:'12px 12px',overflowY:'auto',display:'flex',flexDirection:'column',gap:2}}>
        <div className="sidebar-section-label" style={{color:'rgba(255,255,255,0.3)',fontSize:10,fontWeight:700,letterSpacing:1.5,padding:'8px 8px 4px',textTransform:'uppercase'}}>Menú</div>
        {NAV.map(item => {
          const isActive = active === item.id;
          return (
            <button key={item.id} onClick={() => setActive(item.id)} title={item.label} style={{
              display:'flex',alignItems:'center',gap:10,
              padding:'9px 12px',borderRadius:10,border:'none',cursor:'pointer',
              background:isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
              color:isActive ? '#fff' : 'var(--sidebar-text)',
              fontFamily:'inherit',fontSize:13.5,fontWeight:isActive ? 600 : 400,
              textAlign:'left',width:'100%',transition:'all 0.15s',
            }}>
              <span style={{opacity:isActive ? 1 : 0.7,flexShrink:0}}><Icon name={item.icon} size={16}/></span>
              <span className="sidebar-label">{item.label}</span>
              {item.id === 'contabilidad' && pending > 0 && <span className="sidebar-badge" style={{
                marginLeft:'auto',background:'var(--red)',color:'#fff',
                fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:999
              }}>{pending > 99 ? '99+' : pending}</span>}
            </button>
          );
        })}
      </nav>
      {/* Logout */}
      <div style={{padding:'12px',borderTop:'1px solid rgba(255,255,255,0.07)'}}>
        <button type="button" onClick={() => { window.location.href = '/api/auth/signout?callbackUrl=' + encodeURIComponent('/login'); }} style={{
          display:'flex',alignItems:'center',gap:10,width:'100%',
          padding:'9px 12px',borderRadius:10,border:'none',cursor:'pointer',
          background:'transparent',color:'rgba(255,255,255,0.4)',
          fontFamily:'inherit',fontSize:13,fontWeight:400,transition:'all 0.15s'
        }}>
          <Icon name="logout" size={16}/>Cerrar sesión
        </button>
      </div>
    </div>
  );
}

// ── DASHBOARD ───────────────────────────────────────────────────────────────
function Dashboard({ setActive }) {
  const { bundle, fmtMoney } = useCrm();
  const meta = bundle?.meta?.today ? new Date(bundle.meta.today) : new Date();
  const dateStr = meta.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const ingresosMes = bundle?.ingresosMensual ?? Array(12).fill(0);
  const kp = bundle?.kpis;
  const donut = bundle?.sociosPorDeporte ?? [];
  const EVENTOS_UI = bundle?.eventos ?? [];
  const COBROS_UI = bundle?.cobros ?? [];

  return (
    <div style={{flex:1,overflowY:'auto',padding:'32px 36px',display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Inicio</h1>
          <p style={{color:'#6b7280',fontSize:14,marginTop:4,textTransform:'capitalize'}}>{dateStr}</p>
        </div>
        <button type="button" onClick={() => { window.location.href = '/api/billing/reports/invoices-csv'; }} style={{
          display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
          borderRadius:12,border:'none',cursor:'pointer',
          background:'var(--accent)',color:'#fff',
          fontFamily:'inherit',fontSize:14,fontWeight:600
        }}>
          <Icon name="export" size={15}/>Exportar datos
        </button>
      </div>
      <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
        <KPICard label="Socios activos" value={String(kp?.sociosActivos ?? 0)} sub="Altas activas en el club" icon="users" color="#3B82F6" trend={{up:true}} chart={ingresosMes.slice(-7).length ? ingresosMes.slice(-7) : [0,0,0]}/>
        <KPICard label="Cobros pendientes" value={String(kp?.cobrosPendientes ?? 0)} sub={kp ? fmtMoney(kp.cobrosPendientesMonto) + ' en espera' : '—'} icon="billing" color="#F59E0B" chart={[2,4,3,5,4,6, kp?.cobrosPendientes ?? 0]}/>
        <KPICard label="Ingresos del mes" value={kp ? fmtMoney(kp.ingresosMes) : '—'} sub="Ingresos registrados" icon="reports" color="#10B981" trend={{up:true}} chart={ingresosMes.slice(-7)}/>
        <KPICard label="Facturas vencidas" value={String(kp?.facturasVencidas ?? 0)} sub="Requieren atención" icon="billing" color="#EF4444" chart={[1,2,1,3,2, kp?.facturasVencidas ?? 0, kp?.facturasVencidas ?? 0]}/>
      </div>
      <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
        <div style={{flex:2,background:'#fff',borderRadius:16,padding:'24px',boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
            <div>
              <div style={{fontWeight:700,fontSize:15,color:'#111827'}}>Ingresos del Año</div>
              <div style={{fontSize:13,color:'#6b7280',marginTop:2}}>Cuotas + cobros registrados</div>
            </div>
          </div>
          <BarChart data={ingresosMes} labels={['E','F','M','A','M','J','J','A','S','O','N','D']} color="#3B82F6" height={120}/>
        </div>
        <div style={{flex:1,background:'#fff',borderRadius:16,padding:'24px',boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{fontWeight:700,fontSize:15,color:'#111827',marginBottom:4}}>Socios por Equipo</div>
          <div style={{fontSize:13,color:'#6b7280',marginBottom:20}}>{kp?.sociosActivos ?? 0} socios activos</div>
          <div style={{display:'flex',alignItems:'center',gap:20}}>
            <DonutChart size={90} segments={donut.length ? donut.map(d => ({ label: d.label, value: Math.max(d.value, 1), color: d.color })) : [{ label: '—', value: 1, color: '#e5e7eb' }]}/>
            <div style={{display:'flex',flexDirection:'column',gap:8,flex:1}}>
              {donut.map(d => (
                <div key={d.label} style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{width:8,height:8,borderRadius:2,background:d.color,flexShrink:0}}></span>
                  <span style={{fontSize:12,color:'#374151',flex:1}}>{d.label}</span>
                  <span style={{fontSize:12,fontWeight:600,color:'#111827'}}>{d.value}</span>
                </div>
              ))}
              {donut.length === 0 && <div style={{fontSize:13,color:'#9ca3af'}}>Sin datos de equipos</div>}
            </div>
          </div>
        </div>
      </div>
      <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
        <div style={{flex:1,background:'#fff',borderRadius:16,padding:'24px',boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:15,color:'#111827'}}>Próximos eventos</div>
            <button type="button" onClick={() => setActive('calendario')} style={{fontSize:12,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontWeight:600,fontFamily:'inherit'}}>Ver todos →</button>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {(EVENTOS_UI.slice(0,4)).map(e => (
              <div key={e.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{
                  width:40,flexShrink:0,textAlign:'center',
                  background:'var(--accent-light)',borderRadius:10,padding:'6px 4px'
                }}>
                  <div style={{fontSize:16,fontWeight:800,color:'var(--accent)',lineHeight:1}}>
                    {new Date(e.fecha).getDate()}
                  </div>
                  <div style={{fontSize:9,color:'var(--accent)',textTransform:'uppercase',fontWeight:600}}>
                    {new Date(e.fecha).toLocaleString('es',{month:'short'})}
                  </div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{e.titulo}</div>
                  <div style={{fontSize:12,color:'#6b7280'}}>{e.hora} — {e.lugar}</div>
                </div>
                <span style={{
                  fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:999,
                  background:'var(--accent-light)',color:'var(--accent)',whiteSpace:'nowrap'
                }}>{e.tipo}</span>
              </div>
            ))}
            {EVENTOS_UI.length === 0 && <div style={{fontSize:13,color:'#9ca3af'}}>No hay eventos próximos</div>}
          </div>
        </div>
        <div style={{flex:1,background:'#fff',borderRadius:16,padding:'24px',boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:15,color:'#111827'}}>Cobros Recientes</div>
            <button type="button" onClick={() => setActive('contabilidad')} style={{fontSize:12,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontWeight:600,fontFamily:'inherit'}}>Ver todos →</button>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {(COBROS_UI.slice(0,4)).map(c => (
              <div key={c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                <Avatar initials={c.socio.split(' ').map(w=>w[0]).join('').slice(0,2)} color="#3B82F6" size={34}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.socio}</div>
                  <div style={{fontSize:12,color:'#6b7280'}}>{c.concepto}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#111827'}}>{fmtMoney(c.monto)}</div>
                  <Badge status={c.estado}/>
                </div>
              </div>
            ))}
            {COBROS_UI.length === 0 && <div style={{fontSize:13,color:'#9ca3af'}}>Sin facturas</div>}
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
  const { bundle, reload, fmtMoney, showAlert } = useCrm();
  const SOCIOS_UI = bundle?.socios ?? [];
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
    dni: '',
    email: '',
    domicilio: '',
    deporte: '',
    fechaAlta: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    if (!selected) setShowEditSocioModal(false);
  }, [selected]);

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
    if (!formInscripcion.nombre.trim() || !formInscripcion.apellidos.trim() || !formInscripcion.telefono.trim()) {
      showAlert('Nombre, apellidos y teléfono son obligatorios.');
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
      setShowInscripcion(false);
      await reload();
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
      const nextSoc = j?.socios?.find((x) => x.id === savedId);
      if (nextSoc) setSelected(nextSoc);
    } finally {
      setEditSocioBusy(false);
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

  return (
    <div style={{flex:1,overflowY:'auto',padding:'32px 36px',display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Socios</h1>
          <p style={{color:'#6b7280',fontSize:14,marginTop:4}}>
            {teamFilterId && equipoFiltrado
              ? `${filtered.length} de ${SOCIOS_UI.length} socios · equipo «${equipoFiltrado.nombre}»`
              : `${SOCIOS_UI.length} socios registrados`}
          </p>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',alignItems:'flex-start',gap:12}}>
          <InviteLinkButton />
          <PaymentReminderButton />
          <button type="button" onClick={abrirFormularioInscripcion} style={{
          display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
          borderRadius:12,border:'none',cursor:'pointer',
          background:'var(--accent)',color:'#fff',
          fontFamily:'inherit',fontSize:14,fontWeight:600
        }}>
          <Icon name="plus" size={15}/>Nuevo Socio
          </button>
        </div>
      </div>
      {/* Filters */}
      <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{position:'relative',flex:1,minWidth:200}}>
          <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#9ca3af'}}>
            <Icon name="search" size={16}/>
          </span>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar por nombre o correo electrónico…"
            style={{
              width:'100%',padding:'10px 12px 10px 38px',
              borderRadius:12,border:'1px solid var(--border)',
              fontFamily:'inherit',fontSize:14,background:'#fff',
              outline:'none',color:'#111827'
            }}/>
        </div>
        {estados.map(e => (
          <button key={e} onClick={() => setFilterEstado(e)} style={{
            padding:'8px 16px',borderRadius:999,border:'1.5px solid',
            cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:500,
            background:filterEstado===e ? '#111827' : '#fff',
            color:filterEstado===e ? '#fff' : '#6b7280',
            borderColor:filterEstado===e ? '#111827' : 'var(--border)'
          }}>{e}</button>
        ))}
        <select value={filterDeporte} onChange={e=>setFilterDeporte(e.target.value)} style={{
          padding:'9px 14px',borderRadius:12,border:'1px solid var(--border)',
          fontFamily:'inherit',fontSize:13,background:'#fff',color:'#374151',outline:'none',cursor:'pointer'
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
      {/* Table */}
      <div style={{background:'#fff',borderRadius:16,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',overflow:'visible',position:'relative'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--border)'}}>
              {['Socio','DNI','Deporte','Categoría','Cuota','Vencimiento','Estado',''].map(h => (
                <th key={h} style={{
                  padding:'14px 16px',textAlign:'left',fontSize:12,
                  fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:0.5
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <tr key={s.id} onClick={() => setSelected(s)} style={{
                borderBottom:'1px solid var(--border)',cursor:'pointer',
                background:selected?.id===s.id ? 'var(--accent-light)' : i%2===0?'#fff':'#fafafa',
                transition:'background 0.1s'
              }}>
                <td style={{padding:'14px 16px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <Avatar initials={s.avatar} color="#3B82F6" size={34}/>
                    <div>
                      <div style={{fontWeight:600,fontSize:14,color:'#111827'}}>{s.nombre}</div>
                      <div style={{fontSize:12,color:'#6b7280'}}>{s.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{padding:'14px 16px',fontSize:13,color:'#475569'}}>{s.dni || '—'}</td>
                <td style={{padding:'14px 16px',fontSize:14,color:'#374151'}}>{s.deporte}</td>
                <td style={{padding:'14px 16px',fontSize:14,color:'#374151'}}>{s.categoria}</td>
                <td style={{padding:'14px 16px',fontSize:14,fontWeight:600,color:'#111827'}}>{fmtMoney(s.cuota)}</td>
                <td style={{padding:'14px 16px',fontSize:14,color:'#374151'}}>{new Date(s.vencimiento).toLocaleDateString('es-AR')}</td>
                <td style={{padding:'14px 16px'}}><Badge status={s.estado}/></td>
                <td style={{padding:'14px 16px'}}>
                  <div style={{display:'flex',gap:4}}>
                    <button type="button" onClick={e=>{e.stopPropagation(); setSelected(s);}} style={{padding:6,borderRadius:8,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',color:'#6b7280'}} title="Ver y editar"><Icon name="edit" size={14}/></button>
                    <button onClick={e=>{e.stopPropagation();}} style={{padding:6,borderRadius:8,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',color:'#6b7280'}}><Icon name="dots" size={14}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  );
}

// ── EQUIPOS ─────────────────────────────────────────────────────────────────
function Equipos() {
  const router = useRouter()
  const { bundle, reload, showAlert } = useCrm();
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

  function openGestionar(eq) {
    setGestionarEquipo(eq);
    setFormGestionarTeam({
      nombre: eq.nombre || '',
      categoria: eq.categoriaDb !== undefined ? eq.categoriaDb : '',
    });
    setCoachSelectMemberId(eq.coachMemberId || '');
    setAddAlEquipoMemberId('');
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

  return (
    <div style={{flex:1,overflowY:'auto',padding:'24px',display:'flex',flexDirection:'column',gap:20}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Equipos</h1>
          <p style={{color:'#6b7280',fontSize:14,marginTop:4}}>{EQUIPOS_UI.length} equipos</p>
        </div>
        <div style={{display:'flex',gap:10}}>
          <div style={{display:'flex',background:'#fff',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
            {[['grid','⊞'],['list','☰']].map(([v,icon])=>(
              <button key={v} onClick={()=>setView(v)} style={{
                padding:'8px 14px',border:'none',cursor:'pointer',
                background:view===v?'#111827':'transparent',
                color:view===v?'#fff':'#6b7280',fontFamily:'inherit',fontSize:14
              }}>{icon}</button>
            ))}
          </div>
          <button type="button" onClick={openNuevoEquipoModal} style={{
            display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
            borderRadius:12,border:'none',cursor:'pointer',
            background:'var(--accent)',color:'#fff',
            fontFamily:'inherit',fontSize:14,fontWeight:600
          }}>
            <Icon name="plus" size={15}/>Nuevo Equipo
          </button>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:16,width:'100%'}}>
        {EQUIPOS_UI.map(eq => (
          <div key={eq.id} style={{
            background:'#fff',borderRadius:16,padding:16,
            boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',
            cursor:'default',transition:'transform 0.15s,box-shadow 0.15s'
          }}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16,gap:6}}>
              <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                <div style={{
                  width:40,height:40,borderRadius:12,flexShrink:0,
                  background:`${eq.color}15`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:20
                }}>{eq.logo}</div>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{eq.nombre}</div>
                  <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>{eq.deporte} · {eq.categoria}</div>
                </div>
              </div>
              <span style={{
                fontSize:11,fontWeight:600,padding:'3px 7px',borderRadius:999,flexShrink:0,
                background:`${eq.color}15`,color:eq.color,whiteSpace:'nowrap'
              }}>{eq.jugadores}</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8,borderTop:'1px solid var(--border)',paddingTop:14}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
                <span style={{fontSize:12,color:'#6b7280',flexShrink:0}}>Entrenador</span>
                <span style={{fontSize:12,fontWeight:600,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'right'}}>{eq.entrenador}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
                <span style={{fontSize:12,color:'#6b7280',flexShrink:0}}>Horario</span>
                <span style={{fontSize:12,fontWeight:600,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'right'}}>{eq.horario}</span>
              </div>
            </div>
            <div style={{marginTop:14,display:'flex',flexWrap:'wrap',gap:8}}>
              <button type="button" onClick={(e) => { e.stopPropagation(); openGestionar(eq); }} style={{flex:1,minWidth:88,padding:'8px',borderRadius:10,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,color:'#374151'}}>Gestionar</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); router.replace(`/?tab=socios&team=${encodeURIComponent(eq.id)}`, { scroll: false }); }} style={{flex:1,minWidth:88,padding:'8px',borderRadius:10,border:'none',background:`${eq.color}15`,color:eq.color,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>Ver socios</button>
            </div>
          </div>
        ))}
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
  );
}

// ── COBROS ──────────────────────────────────────────────────────────────────
function Contabilidad({ setActive }) {
  const { bundle, reload, fmtMoney, showAlert, showConfirm } = useCrm();
  const COBROS_UI = bundle?.cobros ?? [];
  const SOCIOS_UI = bundle?.socios ?? [];
  const [contaTab, setContaTab] = useState('DIARIO');
  const [tab, setTab] = useState('Todos');
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
  const contaTabs = ['DIARIO', 'MAYOR', 'CUENTAS', 'BALANCES'];
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

  return (
    <div style={{flex:1,overflowY:'auto',padding:'32px 36px',display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Contabilidad</h1>
          <p style={{color:'#6b7280',fontSize:14,marginTop:4}}>Gestión contable PGC y cobros</p>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button type="button" onClick={() => { window.location.href = '/api/billing/reports/invoices-csv'; }} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderRadius:12,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:14,fontWeight:600,color:'#374151'}}>
            <Icon name="export" size={15}/>Exportar datos
          </button>
          <button type="button" onClick={() => openMovimientoModal('INCOME')} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderRadius:12,border:'1px solid rgba(16,185,129,0.35)',background:'#ecfdf5',cursor:'pointer',fontFamily:'inherit',fontSize:14,fontWeight:700,color:'#047857'}}>
            <Icon name="plus" size={15}/>Crear ingreso
          </button>
          <button type="button" onClick={() => openMovimientoModal('EXPENSE')} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderRadius:12,border:'1px solid rgba(239,68,68,0.25)',background:'#fef2f2',cursor:'pointer',fontFamily:'inherit',fontSize:14,fontWeight:700,color:'#b91c1c'}}>
            <Icon name="plus" size={15}/>Crear gasto
          </button>
        </div>
      </div>
      {/* Summary cards */}
      <div style={{display:'flex',gap:12}}>
        {[
            {label:'Total facturado',value: fmtMoney(totales.total),color:'#3B82F6',bg:'#EFF6FF'},
            {label:'Cobrado',value: fmtMoney(totales.pagado),color:'var(--green)',bg:'var(--green-light)'},
            {label:'Pendiente',value: fmtMoney(totales.pendiente),color:'var(--amber)',bg:'var(--amber-light)'},
            {label:'Deuda vencida',value: fmtMoney(totales.vencido),color:'var(--red)',bg:'var(--red-light)'},
        ].map(({label,value,color,bg}) => (
          <div key={label} style={{flex:1,background:bg,borderRadius:14,padding:'16px 20px',display:'flex',flexDirection:'column',gap:4}}>
            <div style={{fontSize:12,color,fontWeight:600,opacity:0.8}}>{label}</div>
            <div style={{fontSize:22,fontWeight:800,color,letterSpacing:'-0.5px'}}>{value}</div>
          </div>
        ))}
      </div>
      {/* Tabs */}
      <div style={{display:'flex',gap:2,background:'#fff',border:'1px solid var(--border)',borderRadius:12,padding:4,width:'fit-content'}}>
        {contaTabs.map((t) => (
          <button key={t} onClick={() => setContaTab(t)} style={{
            padding:'8px 14px',borderRadius:9,border:'none',cursor:'pointer',
            background:contaTab===t?'#111827':'transparent',
            color:contaTab===t?'#fff':'#6b7280',fontFamily:'inherit',fontSize:12,fontWeight:600
          }}>{t}</button>
        ))}
      </div>

      <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:12,padding:'12px 14px',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{fontSize:12,fontWeight:700,color:'#475569',minWidth:130}}>Configuración impuestos</div>
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
        <button type="button" disabled={taxBusy} onClick={guardarConfigImpuestos} style={{marginLeft:'auto',padding:'8px 12px',borderRadius:10,border:'1px solid var(--border)',background:'#111827',color:'#fff',fontFamily:'inherit',fontSize:12,fontWeight:700,cursor:taxBusy?'not-allowed':'pointer',opacity:taxBusy?0.7:1}}>
          {taxBusy ? 'Guardando…' : 'Guardar impuestos'}
        </button>
      </div>

      <div style={{background:'#fff',borderRadius:16,padding:16,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)'}}>
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

      {contaTab === 'COBROS' && (
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:2,background:'#fff',border:'1px solid var(--border)',borderRadius:12,padding:4,width:'fit-content'}}>
          {tabs.map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{
              padding:'8px 20px',borderRadius:9,border:'none',cursor:'pointer',
              background:tab===t?'#111827':'transparent',
              color:tab===t?'#fff':'#6b7280',
              fontFamily:'inherit',fontSize:13,fontWeight:tab===t?600:400
            }}>{t} {t!=='Todos' && <span style={{opacity:0.7}}>({cobrosEnRango.filter(c=>c.estado===t).length})</span>}</button>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={{fontSize:12,fontWeight:700,color:'#64748b'}}>Rango (registro)</span>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            style={{padding:'8px 10px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'#374151'}}
          />
          <span style={{fontSize:12,color:'#9ca3af'}}>—</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            style={{padding:'8px 10px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'#374151'}}
          />
          <button
            type="button"
            onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
            style={{padding:'8px 10px',borderRadius:10,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,color:'#64748b'}}
          >
            Limpiar
          </button>
        </div>
      </div>
      )}
      {/* Table */}
      {contaTab === 'COBROS' && (
      <div style={{background:'#fff',borderRadius:16,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--border)'}}>
              {['Socio','Concepto','Deporte','Importe','Vencimiento','Estado','Acciones'].map(h => (
                <th key={h} style={{padding:'14px 16px',textAlign:'left',fontSize:12,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:0.5}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.id} style={{borderBottom:'1px solid var(--border)',background:i%2===0?'#fff':'#fafafa'}}>
                <td style={{padding:'14px 16px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <Avatar initials={c.socio.split(' ').map(w=>w[0]).join('').slice(0,2)} color="#3B82F6" size={32}/>
                    <span style={{fontWeight:600,fontSize:14,color:'#111827'}}>{c.socio}</span>
                  </div>
                </td>
                <td style={{padding:'14px 16px',fontSize:14,color:'#374151'}}>{c.concepto}</td>
                <td style={{padding:'14px 16px',fontSize:14,color:'#374151'}}>{c.deporte}</td>
                <td style={{padding:'14px 16px'}}>
                  <div style={{fontSize:14,fontWeight:800,color:'#111827'}}>{fmtMoney(c.monto)}</div>
                  <div style={{fontSize:11,color:'#64748b',marginTop:3}}>
                    Base {fmtMoney(Number(c.subtotal || 0))} · IVA {fmtMoney(Number(c.iva || 0))} · Ret. {fmtMoney(Number(c.retencion || 0))}
                  </div>
                </td>
                <td style={{padding:'14px 16px',fontSize:14,color:c.estado==='Vencido'?'var(--red)':'#374151',fontWeight:c.estado==='Vencido'?600:400}}>
                  {new Date(c.vencimiento).toLocaleDateString('es-AR')}
                </td>
                <td style={{padding:'14px 16px'}}><Badge status={c.estado}/></td>
                <td style={{padding:'14px 16px'}}>
                  <div style={{display:'flex',justifyContent:'flex-end'}} data-cobro-menu>
                    <button
                      type="button"
                      onClick={(e) => toggleMenuCobro(e, c.id)}
                      style={{padding:6,borderRadius:8,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',color:'#6b7280'}}
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

  return (
    <div style={{flex:1,overflowY:'auto',padding:'32px 36px',display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Calendario</h1>
          <p style={{color:'#6b7280',fontSize:14,marginTop:4,textTransform:'capitalize'}}>{monthTitle}</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',justifyContent:'flex-end'}}>
          <span style={{fontSize:12,fontWeight:700,color:'#64748b'}}>Rango</span>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            style={{padding:'8px 10px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'#374151'}}
          />
          <span style={{fontSize:12,color:'#9ca3af'}}>—</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            style={{padding:'8px 10px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'#374151'}}
          />
          <button
            type="button"
            onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
            style={{padding:'8px 10px',borderRadius:10,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,color:'#64748b'}}
          >
            Limpiar
          </button>
          <button type="button" onClick={() => setViewYm(prev => {
            let m = prev.month - 1, y = prev.year;
            if (m < 0) { m = 11; y--; }
            return { year:y, month:m };
          })} style={{padding:'8px 12px',borderRadius:10,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit'}}>← Mes</button>
          <button type="button" onClick={() => setViewYm(prev => {
            let m = prev.month + 1, y = prev.year;
            if (m > 11) { m = 0; y++; }
            return { year:y, month:m };
          })} style={{padding:'8px 12px',borderRadius:10,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Mes →</button>
          <button type="button" onClick={openNuevoEventoModal} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:12,border:'none',cursor:'pointer',background:'var(--accent)',color:'#fff',fontFamily:'inherit',fontSize:14,fontWeight:600}}>
            <Icon name="plus" size={15}/>Nuevo evento
          </button>
        </div>
      </div>
      <div style={{display:'flex',gap:20}}>
        {/* Calendar grid */}
        <div style={{flex:2,background:'#fff',borderRadius:16,padding:24,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:8}}>
            {days.map(d => (
              <div key={d} style={{textAlign:'center',fontSize:12,fontWeight:600,color:'#9ca3af',padding:'8px 0'}}>{d}</div>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
            {Array(firstDay).fill(null).map((_,i)=><div key={`e${i}`}/>)}
            {Array(daysInMonth).fill(null).map((_,i)=>{
              const d = i+1;
              const evts = dayEvents(d);
              const isSelected = selectedDay === d;
              const isToday = isTodayMarker(d);
              return (
                <div key={d} onClick={()=>setSelectedDay(d===selectedDay?null:d)} style={{
                  minHeight:80,padding:'6px',borderRadius:10,cursor:'pointer',
                  background:isSelected?'var(--accent-light)':isToday?'#FFF7ED':'#FAFAFA',
                  border:`1.5px solid ${isSelected?'var(--accent)':isToday?'#FED7AA':'transparent'}`,
                  transition:'all 0.1s'
                }}>
                  <div style={{
                    width:26,height:26,borderRadius:'50%',
                    background:isToday?'var(--accent)':'transparent',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:13,fontWeight:isToday?700:500,
                    color:isToday?'#fff':'#374151',marginBottom:4
                  }}>{d}</div>
                  {evts.map(e => {
                    const tc = tipoColors[e.tipo] || '#64748b';
                    return (
                    <div key={e.id} style={{
                      fontSize:10,fontWeight:600,padding:'2px 5px',borderRadius:4,marginBottom:2,
                      background:`${tc}20`,color:tc,
                      whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'
                    }}>{e.titulo}</div>
                  );})}
                </div>
              );
            })}
          </div>
        </div>
        {/* Events list */}
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:12}}>
          <div style={{background:'#fff',borderRadius:16,padding:20,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
            <div style={{fontWeight:700,fontSize:14,color:'#111827',marginBottom:14}}>
              {selectedDay ? `Eventos del día ${selectedDay}` : 'Todos los eventos del mes'}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10,maxHeight:420,overflowY:'auto'}}>
              {(selectedDay ? dayEvents(selectedDay) : monthEvents).map(e => {
                const tc = tipoColors[e.tipo] || '#64748b';
                return (
                <div key={e.id} style={{
                  padding:14,borderRadius:12,
                  background:`${tc}08`,
                  borderLeft:`3px solid ${tc}`
                }}>
                  <div style={{fontSize:13,fontWeight:700,color:'#111827',marginBottom:4}}>{e.titulo}</div>
                  <div style={{fontSize:12,color:'#6b7280',marginBottom:2}}>{new Date(e.fecha).toLocaleDateString('es-AR')} — {e.hora}</div>
                  <div style={{fontSize:12,color:'#6b7280'}}>{e.lugar}</div>
                  <div style={{display:'flex',gap:6,marginTop:8}}>
                    <span style={{
                      fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:999,
                      background:`${tc}20`,color:tc
                    }}>{e.tipo}</span>
                    <span style={{
                      fontSize:11,fontWeight:500,padding:'2px 8px',borderRadius:999,
                      background:'#F1F5F9',color:'#64748b'
                    }}>{e.equipo}</span>
                  </div>
                </div>
              );})}
              {selectedDay && dayEvents(selectedDay).length === 0 && (
                <div style={{textAlign:'center',padding:'24px 0',color:'#9ca3af',fontSize:14}}>Sin eventos este día</div>
              )}
            </div>
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
  );
}

// ── INFORMES ────────────────────────────────────────────────────────────────
function Informes({ setActive }) {
  const { bundle, fmtMoney } = useCrm();
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

  return (
    <div style={{flex:1,overflowY:'auto',padding:'32px 36px',display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Informes</h1>
          <p style={{color:'#6b7280',fontSize:14,marginTop:4}}>Resumen financiero y operacional</p>
        </div>
        <div style={{display:'flex',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontSize:12,fontWeight:700,color:'#64748b'}}>Rango</span>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              style={{padding:'8px 10px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'#374151'}}
            />
            <span style={{fontSize:12,color:'#9ca3af'}}>—</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              style={{padding:'8px 10px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'#374151'}}
            />
            <button
              type="button"
              onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
              style={{padding:'8px 10px',borderRadius:10,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,color:'#64748b'}}
            >
              Limpiar
            </button>
          </div>
          <button type="button" onClick={() => { window.location.href = '/api/billing/reports/invoices-csv'; }} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderRadius:12,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:14,fontWeight:600,color:'#374151'}}>
            <Icon name="export" size={15}/>Exportar datos CSV
          </button>
        </div>
      </div>
      {/* Totales anuales */}
      <div style={{display:'flex',gap:16}}>
        {[
          {label:'Ingresos totales',value: fmtMoney(totIng),color:'var(--green)',bg:'var(--green-light)',trend:'—'},
          {label:'Gastos totales',value: fmtMoney(totEgr),color:'var(--red)',bg:'var(--red-light)',trend:'—'},
          {label:'Resultado neto',value: fmtMoney(totIng - totEgr),color:'var(--accent)',bg:'var(--accent-light)',trend:'—'},
        ].map(({label,value,color,bg,trend}) => (
          <div key={label} style={{flex:1,background:bg,borderRadius:16,padding:'20px 24px'}}>
            <div style={{fontSize:12,color,fontWeight:600,marginBottom:6}}>{label}</div>
            <div style={{fontSize:26,fontWeight:800,color,letterSpacing:'-1px'}}>{value}</div>
            <div style={{fontSize:12,color,marginTop:6,opacity:0.8}}>{trend}</div>
          </div>
        ))}
      </div>
      {/* Charts */}
      <div style={{display:'flex',gap:16}}>
        <div style={{flex:2,background:'#fff',borderRadius:16,padding:24,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{fontWeight:800,fontSize:16,color:'#0f172a',marginBottom:4,letterSpacing:'-0.2px'}}>Ingresos y gastos</div>
          <div style={{fontSize:13,color:'#6b7280',marginBottom:20}}>Enero — Diciembre 2026</div>
          <div style={{position:'relative'}}>
            <BarChart data={ingresos} secondaryData={egresos} labels={meses} color="#3B82F6" secondaryColor="#EF4444" height={150}/>
          </div>
          <div style={{display:'flex',gap:16,marginTop:12}}>
            <span style={{fontSize:12,display:'flex',alignItems:'center',gap:6,color:'#374151'}}>
              <span style={{width:12,height:12,borderRadius:3,background:'#3B82F6',display:'inline-block'}}></span>Ingresos
            </span>
            <span style={{fontSize:12,display:'flex',alignItems:'center',gap:6,color:'#374151'}}>
              <span style={{width:12,height:12,borderRadius:3,background:'#EF4444',display:'inline-block'}}></span>Gastos
            </span>
          </div>
        </div>
        <div style={{flex:1,background:'#fff',borderRadius:16,padding:24,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{fontWeight:700,fontSize:15,color:'#111827',marginBottom:4}}>Ingresos por concepto</div>
          <div style={{fontSize:13,color:'#6b7280',marginBottom:16}}>Año 2026</div>
          <DonutChart size={110} segments={donutSegments}/>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:16}}>
            {conceptos.length === 0 ? (
              <div style={{fontSize:12,color:'#6b7280'}}>Sin ingresos registrados.</div>
            ) : conceptos.map((row) => (
              <div key={row.label} style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:8,height:8,borderRadius:2,background:row.color,flexShrink:0}}></span>
                <span style={{fontSize:12,color:'#374151',flex:1}}>{row.label}</span>
                <span style={{fontSize:12,fontWeight:700,color:'#111827'}}>
                  {totalConceptos > 0 ? `${Math.round((row.value / totalConceptos) * 100)}%` : '0%'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Top deudores */}
      <div style={{background:'#fff',borderRadius:16,padding:24,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
        <div style={{fontWeight:700,fontSize:15,color:'#111827',marginBottom:16}}>Socios con deuda vencida</div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {SOCIOS_UI.filter(s=>s.estado==='Moroso').map(s => (
            <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
              <Avatar initials={s.avatar} color="var(--red)" size={36}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14,color:'#111827'}}>{s.nombre}</div>
                <div style={{fontSize:12,color:'#6b7280'}}>{s.deporte} · Vence {new Date(s.vencimiento).toLocaleDateString('es-AR')}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontWeight:700,fontSize:14,color:'var(--red)'}}>{fmtMoney(s.cuota)}</div>
                <Badge status="Moroso"/>
              </div>
              <button type="button" onClick={() => setActive('socios')} style={{padding:'7px 14px',borderRadius:8,border:'none',background:'var(--red-light)',color:'var(--red)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>Ver en Socios</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Workflows() {
  const { bundle, reload } = useCrm();
  return <WorkflowsSection bundle={bundle} reload={reload} />;
}

function normalizePhoneE164(raw: string) {
  const only = String(raw || '').replace(/[^\d+]/g, '')
  if (!only) return ''
  if (only.startsWith('+')) return only.slice(1)
  return only
}

function WhatsAppSection() {
  const { showAlert, reload } = useCrm()
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

  return (
    <div style={{flex:1,overflowY:'auto',padding:'32px 36px',display:'flex',flexDirection:'column',gap:20}}>
      <div>
        <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Whatsapp</h1>
        <p style={{color:'#6b7280',fontSize:14,marginTop:4}}>Conexión ApiWass y envío integrado con el CRM.</p>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:14}}>
        <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:14,padding:14}}>
          <div style={{fontSize:13,fontWeight:700,color:'#111827',marginBottom:10}}>Sesión vinculada al CRM</div>
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            <input value={createSessionId} onChange={(e)=>setCreateSessionId(e.target.value)} placeholder="session-id-crm" style={{flex:1,padding:'9px 11px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13}} />
            <button type="button" onClick={createSession} disabled={busy || !!session} style={{padding:'9px 12px',borderRadius:10,border:'none',background:'var(--accent)',color:'#fff',fontFamily:'inherit',fontWeight:700,cursor:busy?'not-allowed':'pointer',opacity:(busy || !!session)?0.7:1}}>Crear sesión</button>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:10,alignItems:'center',padding:'9px 11px',borderRadius:10,border:'1px solid var(--border)',background:'#fafafa'}}>
            <span style={{fontSize:13,color:'#111827',fontWeight:600,flex:1}}>
              {session ? `${session.id} · ${session.status || session.state || 'UNKNOWN'}` : 'Sin sesión vinculada'}
            </span>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button type="button" onClick={() => runSessionAction('restart')} disabled={busy || !activeSessionId} style={{padding:'8px 11px',borderRadius:9,border:'1px solid var(--border)',background:'#fff',fontFamily:'inherit',fontWeight:600,cursor:busy?'not-allowed':'pointer'}}>Reiniciar</button>
            <button type="button" onClick={() => runSessionAction('delete')} disabled={busy || !activeSessionId} style={{padding:'8px 11px',borderRadius:9,border:'1px solid rgba(239,68,68,0.3)',background:'#fff',color:'#b91c1c',fontFamily:'inherit',fontWeight:700,cursor:busy?'not-allowed':'pointer'}}>Eliminar</button>
            <span style={{fontSize:12,color:'#6b7280'}}>Esta es la única sesión vinculada y visible en este CRM.</span>
            <span style={{marginLeft:'auto',fontSize:12,fontWeight:700,color:status==='READY'?'#047857':status==='QR_READY'?'#b45309':'#64748b'}}>Estado: {status}</span>
          </div>
        </div>

        <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:14,padding:14,display:'flex',alignItems:'center',justifyContent:'center',minHeight:180}}>
          {qrImage ? (
            <img
              src={qrImage}
              alt="QR WhatsApp"
              style={{
                width: 220,
                height: 220,
                maxWidth: '100%',
                objectFit: 'contain',
                imageRendering: 'pixelated',
                borderRadius: 0,
                border: '1px solid var(--border)',
                background: '#fff',
              }}
            />
          ) : (
            <div style={{fontSize:12,color:'#6b7280'}}>Sin QR disponible (si estado es READY no hace falta escanear).</div>
          )}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <form onSubmit={sendTextMessage} style={{background:'#fff',border:'1px solid var(--border)',borderRadius:14,padding:14}}>
          <div style={{fontSize:13,fontWeight:700,color:'#111827',marginBottom:10}}>Enviar mensaje manual</div>
          <label style={{fontSize:12,fontWeight:600,color:'#64748b',display:'block',marginBottom:5}}>Teléfono (E.164 sin +)</label>
          <input value={sendPhone} onChange={(e)=>setSendPhone(e.target.value)} placeholder="34666777888" style={{width:'100%',padding:'9px 11px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,marginBottom:10}} />
          <label style={{fontSize:12,fontWeight:600,color:'#64748b',display:'block',marginBottom:5}}>Mensaje</label>
          <textarea value={sendMessage} onChange={(e)=>setSendMessage(e.target.value)} rows={4} placeholder="Hola, este mensaje sale desde Furvoley CRM." style={{width:'100%',padding:'9px 11px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,marginBottom:10}} />
          <button type="submit" disabled={busy || !activeSessionId} style={{padding:'9px 12px',borderRadius:10,border:'none',background:'var(--accent)',color:'#fff',fontFamily:'inherit',fontWeight:700,cursor:busy?'not-allowed':'pointer'}}>Enviar WhatsApp</button>
        </form>

        <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:14,padding:14}}>
          <div style={{fontSize:13,fontWeight:700,color:'#111827',marginBottom:10}}>Logs de sesión</div>
          <div style={{maxHeight:180,overflowY:'auto',display:'flex',flexDirection:'column',gap:6}}>
            {logs.length === 0 ? (
              <div style={{fontSize:12,color:'#6b7280'}}>Sin logs recientes.</div>
            ) : logs.slice(0, 80).map((l:any, i:number) => (
              <div key={i} style={{fontSize:12,color:'#374151',padding:'6px 8px',border:'1px solid var(--border)',borderRadius:8,background:'#fafafa'}}>
                {typeof l === 'string' ? l : JSON.stringify(l)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── APP ROOT ─────────────────────────────────────────────────────────────────
const CRM_SECTION_IDS = ['dashboard','socios','equipos','contabilidad','calendario','informes','workflows','whatsapp'] as const;
type SectionId = (typeof CRM_SECTION_IDS)[number]

function CrmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { loading, error, bundle } = useCrm()
  const [showNotifications, setShowNotifications] = useState(false)

  const tabRaw = searchParams.get('tab') ?? ''
  const normalizedTab = tabRaw === 'cobros' ? 'contabilidad' : tabRaw
  const active: SectionId = CRM_SECTION_IDS.includes(normalizedTab as SectionId)
    ? (normalizedTab as SectionId)
    : 'dashboard'

  useEffect(() => {
    const tRaw = searchParams.get('tab')
    const t = tRaw === 'cobros' ? 'contabilidad' : tRaw
    if (!t || !CRM_SECTION_IDS.includes(t as SectionId)) {
      router.replace('/?tab=dashboard', { scroll: false })
      return
    }
    if (tRaw === 'cobros') {
      router.replace('/?tab=contabilidad', { scroll: false })
    }
  }, [router, searchParams])

  const setActive = useCallback(
    (id: string) => {
      if (!CRM_SECTION_IDS.includes(id as SectionId)) return
      router.replace(`/?tab=${encodeURIComponent(id)}`, { scroll: false })
    },
    [router]
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
    const now = new Date()
    const addDays = (d: Date, days: number) => {
      const x = new Date(d)
      x.setDate(x.getDate() + days)
      return x
    }
    const inThreeDays = addDays(now, 3)
    const inSevenDays = addDays(now, 7)

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

    return out
      .sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1))
      .slice(0, 8)
  }, [bundle])

  const unreadCount = notifications.length

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
  };
  const Screen = screens[active] || Dashboard;

  if (error) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',padding:24,flexDirection:'column',gap:12}}>
        <p style={{color:'#b91c1c',fontWeight:600}}>{error}</p>
        <button type="button" onClick={() => window.location.href = '/login'} style={{padding:'10px 18px',borderRadius:10,border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Ir al login</button>
      </div>
    );
  }

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',position:'relative'}}>
      {loading && (
        <div style={{position:'absolute',inset:0,background:'rgba(248,247,245,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:600,color:'#374151'}}>
          Cargando CRM…
        </div>
      )}
      <Sidebar active={active} setActive={setActive}/>
      <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',minWidth:0}}>
        <div style={{
          height:56,background:'#fff',borderBottom:'1px solid var(--border)',
          display:'flex',alignItems:'center',justifyContent:'flex-end',
          padding:'0 28px',gap:12,flexShrink:0
        }}>
          <div data-crm-notifications style={{position:'relative'}}>
          <button
            type="button"
            title="Notificaciones"
            aria-label="Notificaciones"
            onClick={() => setShowNotifications((v) => !v)}
            style={{padding:8,borderRadius:10,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',color:'#6b7280',position:'relative'}}
          >
            <Icon name="bell" size={18}/>
            {unreadCount > 0 && (
              <span style={{position:'absolute',top:5,right:5,width:8,height:8,borderRadius:'50%',background:'var(--red)',border:'2px solid #fff'}}></span>
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
                <span style={{fontSize:12,color:'#6b7280'}}>{unreadCount}</span>
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
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{
              width:32,height:32,borderRadius:'50%',
              background:'linear-gradient(135deg,#3B82F6,#8B5CF6)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:13,fontWeight:700,color:'#fff'
            }}>{bundle?.user?.initials || '—'}</div>
            <span style={{fontSize:13,fontWeight:600,color:'#374151'}}>{bundle?.user?.name || 'Administrador'}</span>
          </div>
        </div>
        <div style={{flex:1,overflow:'hidden',display:'flex',minWidth:0}}>
          <Screen setActive={setActive}/>
        </div>
      </div>
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
      className={`${plusJakarta.className} min-h-screen w-full bg-[#F8F7F5] text-[#1a1a1a]`}
    >
      <CrmProvider>
        <CrmInner />
      </CrmProvider>
    </div>
  )
}

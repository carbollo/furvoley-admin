// @ts-nocheck
'use client'

import { InviteLinkButton } from './InviteLinkButton'
import { PaymentReminderButton } from './PaymentReminderButton'
import './crm-vars.css'
import { Plus_Jakarta_Sans } from 'next/font/google'
import React, {
  useState,
  useEffect,
  useCallback,
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
  const reload = useCallback(async () => {
    const r = await fetch('/api/crm/data', { credentials: 'include' });
    if (r.status === 401) {
      window.location.href = '/login?callbackUrl=' + encodeURIComponent('/');
      throw new Error('Unauthorized');
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
  return (
    <CrmContext.Provider value={{ bundle, reload, loading, error, fmtMoney }}>
      {children}
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

function BarChart({ data, labels, color = "var(--accent)", height = 160 }) {
  const safeData = data && data.length ? data : [0];
  const safeLabels = labels && labels.length === safeData.length ? labels : safeData.map(() => '');
  const max = Math.max(...safeData);
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${safeData.length * 48} ${height}`} preserveAspectRatio="none">
      {safeData.map((v, i) => {
        const barH = max > 0 ? (v / max) * (height - 30) : 0;
        const x = i * 48 + 8;
        const y = height - 20 - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width="32" height={barH} rx="4" fill={color} opacity="0.85"/>
            <text x={x+16} y={height-4} textAnchor="middle" fontSize="10" fill="#888" fontFamily="Plus Jakarta Sans">{safeLabels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ segments, size = 100 }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
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
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'socios', label: 'Socios', icon: 'users' },
  { id: 'equipos', label: 'Equipos', icon: 'teams' },
  { id: 'cobros', label: 'Cobros', icon: 'billing' },
  { id: 'calendario', label: 'Calendario', icon: 'calendar' },
  { id: 'informes', label: 'Informes', icon: 'reports' },
  { id: 'workflows', label: 'Workflows', icon: 'workflows' },
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
            }}>{bundle?.user?.role || 'ADMIN'}</div>
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
              {item.id === 'cobros' && pending > 0 && <span className="sidebar-badge" style={{
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
          <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Dashboard</h1>
          <p style={{color:'#6b7280',fontSize:14,marginTop:4,textTransform:'capitalize'}}>{dateStr}</p>
        </div>
        <button type="button" onClick={() => { window.location.href = '/api/billing/reports/invoices-csv'; }} style={{
          display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
          borderRadius:12,border:'none',cursor:'pointer',
          background:'var(--accent)',color:'#fff',
          fontFamily:'inherit',fontSize:14,fontWeight:600
        }}>
          <Icon name="export" size={15}/>Exportar
        </button>
      </div>
      <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
        <KPICard label="Socios Activos" value={String(kp?.sociosActivos ?? 0)} sub="Miembros ACTIVE" icon="users" color="#3B82F6" trend={{up:true}} chart={ingresosMes.slice(-7).length ? ingresosMes.slice(-7) : [0,0,0]}/>
        <KPICard label="Cobros Pendientes" value={String(kp?.cobrosPendientes ?? 0)} sub={kp ? fmtMoney(kp.cobrosPendientesMonto) + ' en espera' : '—'} icon="billing" color="#F59E0B" chart={[2,4,3,5,4,6, kp?.cobrosPendientes ?? 0]}/>
        <KPICard label="Ingresos del Mes" value={kp ? fmtMoney(kp.ingresosMes) : '—'} sub="Transacciones INCOME" icon="reports" color="#10B981" trend={{up:true}} chart={ingresosMes.slice(-7)}/>
        <KPICard label="Facturas Vencidas" value={String(kp?.facturasVencidas ?? 0)} sub="Requieren atención" icon="billing" color="#EF4444" chart={[1,2,1,3,2, kp?.facturasVencidas ?? 0, kp?.facturasVencidas ?? 0]}/>
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
            <div style={{fontWeight:700,fontSize:15,color:'#111827'}}>Próximos Eventos</div>
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
            <button type="button" onClick={() => setActive('cobros')} style={{fontSize:12,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontWeight:600,fontFamily:'inherit'}}>Ver todos →</button>
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
  const { bundle, reload, fmtMoney } = useCrm();
  const SOCIOS_UI = bundle?.socios ?? [];
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('Todos');
  const [filterDeporte, setFilterDeporte] = useState('Todos');
  const [selected, setSelected] = useState(null);
  const [showInscripcion, setShowInscripcion] = useState(false);
  const [inscripcionBusy, setInscripcionBusy] = useState(false);
  const [formInscripcion, setFormInscripcion] = useState({
    nombre: '',
    apellidos: '',
    dni: '',
    email: '',
    domicilio: '',
    deporte: '',
    fechaAlta: new Date().toISOString().slice(0, 10),
  });

  const filtered = SOCIOS_UI.filter(s =>
    (s.nombre.toLowerCase().includes(search.toLowerCase()) || (s.email||'').toLowerCase().includes(search.toLowerCase())) &&
    (filterEstado === 'Todos' || s.estado === filterEstado) &&
    (filterDeporte === 'Todos' || s.deporte === filterDeporte)
  );

  const deportes = ['Todos', ...new Set(SOCIOS_UI.map(s => s.deporte))];
  const estados = ['Todos', 'Activo', 'Moroso', 'Inactivo'];

  function abrirFormularioInscripcion() {
    setFormInscripcion({
      nombre: '',
      apellidos: '',
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
    if (!formInscripcion.nombre.trim() || !formInscripcion.apellidos.trim()) {
      alert('Nombre y apellidos son obligatorios.');
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
          alert(j.error || 'Error al guardar');
        } catch {
          alert('No se pudo crear el socio');
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

  async function guardarEdicionSocio() {
    if (!selected) return;
    const nombre = window.prompt('Nombre', selected.nombre);
    if (!nombre || !String(nombre).trim()) return;
    const email = window.prompt('Email', selected.email || '') || '';
    const phone = window.prompt('Teléfono (opcional)', '') || '';
    const r = await fetch('/api/crm/members/' + selected.id, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: String(nombre).trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      }),
    });
    if (!r.ok) {
      try { alert((await r.json()).error || 'Error'); } catch { alert('No se pudo guardar'); }
      return;
    }
    setSelected(null);
    await reload();
  }

  async function registrarPagoSocio() {
    if (!selected?.pendingInvoiceId) {
      alert('No hay factura pendiente registrada para este socio.');
      return;
    }
    const r = await fetch('/api/crm/invoices/' + selected.pendingInvoiceId + '/mark-paid', { method: 'POST', credentials: 'include' });
    if (!r.ok) { alert('No se pudo registrar el pago'); return; }
    setSelected(null);
    await reload();
  }

  return (
    <div style={{flex:1,overflowY:'auto',padding:'32px 36px',display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Socios</h1>
          <p style={{color:'#6b7280',fontSize:14,marginTop:4}}>{SOCIOS_UI.length} socios registrados</p>
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
            placeholder="Buscar por nombre o email..."
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
      {/* Table */}
      <div style={{background:'#fff',borderRadius:16,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',overflow:'hidden'}}>
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
            <button type="button" onClick={guardarEdicionSocio} style={{flex:1,padding:'10px',borderRadius:12,border:'1.5px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:600,color:'#374151'}}>Editar datos</button>
            <button type="button" onClick={registrarPagoSocio} style={{flex:1,padding:'10px',borderRadius:12,border:'none',background:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:600,color:'#fff'}}>Registrar Pago</button>
          </div>
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
function Equipos({ setActive }) {
  const { bundle, reload } = useCrm();
  const EQUIPOS_UI = bundle?.equipos ?? [];
  const [view, setView] = useState('grid');
  const [focusedId, setFocusedId] = useState(null);

  async function nuevoEquipo() {
    const nombre = window.prompt('Nombre del equipo');
    if (!nombre || !String(nombre).trim()) return;
    const categoria = window.prompt('Categoría (opcional)', '') || '';
    const r = await fetch('/api/crm/teams', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: String(nombre).trim(), category: categoria.trim() || undefined }),
    });
    if (!r.ok) {
      try { alert((await r.json()).error || 'Error'); } catch { alert('No se pudo crear el equipo'); }
      return;
    }
    await reload();
  }

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
          <button type="button" onClick={nuevoEquipo} style={{
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
          <div key={eq.id} onClick={() => setFocusedId(eq.id)} style={{
            background:'#fff',borderRadius:16,padding:16,
            boxShadow:'var(--card-shadow)',border:`1px solid ${focusedId===eq.id?'var(--accent)':'var(--border)'}`,
            cursor:'pointer',transition:'transform 0.15s,box-shadow 0.15s'
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
            <div style={{marginTop:14,display:'flex',gap:8}}>
              <button type="button" onClick={(e) => { e.stopPropagation(); setFocusedId(eq.id); }} style={{flex:1,padding:'8px',borderRadius:10,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,color:'#374151'}}>Destacar</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setActive('socios'); }} style={{flex:1,padding:'8px',borderRadius:10,border:'none',background:`${eq.color}15`,color:eq.color,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>Ver socios</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── COBROS ──────────────────────────────────────────────────────────────────
function Cobros({ setActive }) {
  const { bundle, reload, fmtMoney } = useCrm();
  const COBROS_UI = bundle?.cobros ?? [];
  const [tab, setTab] = useState('Todos');
  const tabs = ['Todos','Pendiente','Pagado','Vencido'];
  const filtered = COBROS_UI.filter(c => tab === 'Todos' || c.estado === tab);
  const totales = {
    total: COBROS_UI.reduce((a,c) => a + c.monto, 0),
    pendiente: COBROS_UI.filter(c=>c.estado==='Pendiente').reduce((a,c)=>a+c.monto,0),
    pagado: COBROS_UI.filter(c=>c.estado==='Pagado').reduce((a,c)=>a+c.monto,0),
    vencido: COBROS_UI.filter(c=>c.estado==='Vencido').reduce((a,c)=>a+c.monto,0),
  };

  async function marcarPagado(c) {
    const r = await fetch('/api/crm/invoices/' + c.id + '/mark-paid', { method: 'POST', credentials: 'include' });
    if (!r.ok) { alert('No se pudo marcar como pagado'); return; }
    await reload();
  }

  return (
    <div style={{flex:1,overflowY:'auto',padding:'32px 36px',display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Cobros</h1>
          <p style={{color:'#6b7280',fontSize:14,marginTop:4}}>Gestión de cuotas y pagos</p>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button type="button" onClick={() => { window.location.href = '/api/billing/reports/invoices-csv'; }} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderRadius:12,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:14,fontWeight:600,color:'#374151'}}>
            <Icon name="export" size={15}/>Exportar
          </button>
          <button type="button" onClick={() => setActive('cobros')} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:12,border:'none',cursor:'pointer',background:'var(--accent)',color:'#fff',fontFamily:'inherit',fontSize:14,fontWeight:600}}>
            <Icon name="plus" size={15}/>Nuevo Cobro
          </button>
        </div>
      </div>
      {/* Summary cards */}
      <div style={{display:'flex',gap:12}}>
        {[
            {label:'Total Facturado',value: fmtMoney(totales.total),color:'#3B82F6',bg:'#EFF6FF'},
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
        {tabs.map(t => (
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:'8px 20px',borderRadius:9,border:'none',cursor:'pointer',
            background:tab===t?'#111827':'transparent',
            color:tab===t?'#fff':'#6b7280',
            fontFamily:'inherit',fontSize:13,fontWeight:tab===t?600:400
          }}>{t} {t!=='Todos' && <span style={{opacity:0.7}}>({COBROS_UI.filter(c=>c.estado===t).length})</span>}</button>
        ))}
      </div>
      {/* Table */}
      <div style={{background:'#fff',borderRadius:16,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--border)'}}>
              {['Socio','Concepto','Deporte','Monto','Vencimiento','Estado','Acciones'].map(h => (
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
                <td style={{padding:'14px 16px',fontSize:14,fontWeight:700,color:'#111827'}}>{fmtMoney(c.monto)}</td>
                <td style={{padding:'14px 16px',fontSize:14,color:c.estado==='Vencido'?'var(--red)':'#374151',fontWeight:c.estado==='Vencido'?600:400}}>
                  {new Date(c.vencimiento).toLocaleDateString('es-AR')}
                </td>
                <td style={{padding:'14px 16px'}}><Badge status={c.estado}/></td>
                <td style={{padding:'14px 16px'}}>
                  <div style={{display:'flex',gap:6}}>
                    {c.estado !== 'Pagado' && (
                      <button type="button" onClick={() => marcarPagado(c)} style={{
                        padding:'6px 12px',borderRadius:8,border:'none',
                        background:'var(--green-light)',color:'var(--green)',
                        cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600
                      }}>Marcar pagado</button>
                    )}
                    <button style={{padding:6,borderRadius:8,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',color:'#6b7280'}}><Icon name="dots" size={14}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CALENDARIO ──────────────────────────────────────────────────────────────
function Calendario({ setActive }) {
  const { bundle, reload } = useCrm();
  const EVENTOS_UI = bundle?.eventos ?? [];
  const todayRef = bundle?.meta?.today ? new Date(bundle.meta.today) : new Date();
  const [viewYm, setViewYm] = useState(() => ({
    year: todayRef.getFullYear(),
    month: todayRef.getMonth(),
  }));
  const [selectedDay, setSelectedDay] = useState(null);
  const year = viewYm.year, month = viewYm.month;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const tipoColors = {Torneo:'#3B82F6',Entrenamiento:'#10B981',Partido:'#F59E0B',Reunión:'#8B5CF6',Competencia:'#EF4444',Especial:'#06B6D4', 'Otro': '#64748b'};

  const dayEvents = (d) => EVENTOS_UI.filter(e => new Date(e.fecha).getDate() === d && new Date(e.fecha).getMonth() === month && new Date(e.fecha).getFullYear() === year);

  const monthEvents = EVENTOS_UI.filter(e => {
    const dt = new Date(e.fecha);
    return dt.getMonth() === month && dt.getFullYear() === year;
  });

  const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const monthTitle = new Date(year, month, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  useEffect(() => { setSelectedDay(null); }, [year, month]);

  const isTodayMarker = (d) => (
    todayRef.getDate()===d && todayRef.getMonth()===month && todayRef.getFullYear()===year
  );

  async function nuevoEventoCRM() {
    const eq = bundle?.equipos ?? [];
    if (!eq.length) {
      alert('Crea antes un equipo (pestaña Equipos).');
      setActive('equipos');
      return;
    }
    let teamId = eq[0].id;
    if (eq.length > 1) {
      const choice = window.prompt('Número de equipo:\n' + eq.map((e, i) => (i + 1) + '. ' + e.nombre).join('\n'));
      const ix = parseInt(choice, 10) - 1;
      if (ix >= 0 && ix < eq.length) teamId = eq[ix].id;
      else return;
    }
    const title = window.prompt('Título del evento');
    if (!title || !String(title).trim()) return;
    const tipo = window.prompt('Tipo (TRAINING, MATCH, TOURNAMENT, OTHER)', 'OTHER') || 'OTHER';
    const fecha = window.prompt('Fecha ISO (ej. ' + new Date().toISOString().slice(0, 16) + ')', new Date().toISOString().slice(0, 16));
    if (!fecha) return;
    const loc = window.prompt('Lugar (opcional)', '') || '';
    const r = await fetch('/api/crm/events', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), teamId, type: tipo.trim(), date: fecha, location: loc.trim() || undefined }),
    });
    if (!r.ok) {
      try { alert((await r.json()).error || 'Error'); } catch { alert('No se pudo crear el evento'); }
      return;
    }
    await reload();
  }

  return (
    <div style={{flex:1,overflowY:'auto',padding:'32px 36px',display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Calendario</h1>
          <p style={{color:'#6b7280',fontSize:14,marginTop:4,textTransform:'capitalize'}}>{monthTitle}</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
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
          <button type="button" onClick={nuevoEventoCRM} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:12,border:'none',cursor:'pointer',background:'var(--accent)',color:'#fff',fontFamily:'inherit',fontSize:14,fontWeight:600}}>
            <Icon name="plus" size={15}/>Nuevo Evento
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
    </div>
  );
}

// ── INFORMES ────────────────────────────────────────────────────────────────
function Informes({ setActive }) {
  const { bundle, fmtMoney } = useCrm();
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const ingresos = bundle?.ingresosMensual ?? Array(12).fill(0);
  const egresos = bundle?.egresoMensual ?? Array(12).fill(0);
  const totIng = ingresos.reduce((a,b)=>a+b,0);
  const totEgr = egresos.reduce((a,b)=>a+b,0);
  const SOCIOS_UI = bundle?.socios ?? [];

  return (
    <div style={{flex:1,overflowY:'auto',padding:'32px 36px',display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Informes</h1>
          <p style={{color:'#6b7280',fontSize:14,marginTop:4}}>Resumen financiero y operacional</p>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button type="button" onClick={() => { window.location.href = '/api/billing/reports/invoices-csv'; }} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderRadius:12,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:14,fontWeight:600,color:'#374151'}}>
            <Icon name="export" size={15}/>Exportar CSV
          </button>
        </div>
      </div>
      {/* Totales anuales */}
      <div style={{display:'flex',gap:16}}>
        {[
          {label:'Ingresos Totales',value: fmtMoney(totIng),color:'var(--green)',bg:'var(--green-light)',trend:'—'},
          {label:'Egresos Totales',value: fmtMoney(totEgr),color:'var(--red)',bg:'var(--red-light)',trend:'—'},
          {label:'Resultado Neto',value: fmtMoney(totIng - totEgr),color:'var(--accent)',bg:'var(--accent-light)',trend:'—'},
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
          <div style={{fontWeight:700,fontSize:15,color:'#111827',marginBottom:4}}>Ingresos vs. Egresos</div>
          <div style={{fontSize:13,color:'#6b7280',marginBottom:20}}>Enero — Diciembre 2026</div>
          <div style={{position:'relative'}}>
            <BarChart data={ingresos} labels={meses} color="#3B82F6" height={130}/>
          </div>
          <div style={{display:'flex',gap:16,marginTop:12}}>
            <span style={{fontSize:12,display:'flex',alignItems:'center',gap:6,color:'#374151'}}>
              <span style={{width:12,height:12,borderRadius:3,background:'#3B82F6',display:'inline-block'}}></span>Ingresos
            </span>
            <span style={{fontSize:12,display:'flex',alignItems:'center',gap:6,color:'#374151'}}>
              <span style={{width:12,height:12,borderRadius:3,background:'#EF4444',display:'inline-block'}}></span>Egresos
            </span>
          </div>
        </div>
        <div style={{flex:1,background:'#fff',borderRadius:16,padding:24,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{fontWeight:700,fontSize:15,color:'#111827',marginBottom:4}}>Ingresos por Concepto</div>
          <div style={{fontSize:13,color:'#6b7280',marginBottom:16}}>Año 2026</div>
          <DonutChart size={110} segments={[
            {label:'Cuotas',value:65,color:'#3B82F6'},
            {label:'Inscripciones',value:20,color:'#8B5CF6'},
            {label:'Torneos',value:10,color:'#10B981'},
            {label:'Otros',value:5,color:'#F59E0B'},
          ]}/>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:16}}>
            {[['Cuotas mensuales','#3B82F6','65%'],['Inscripciones','#8B5CF6','20%'],['Torneos','#10B981','10%'],['Otros','#F59E0B','5%']].map(([l,c,p]) => (
              <div key={l} style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:8,height:8,borderRadius:2,background:c,flexShrink:0}}></span>
                <span style={{fontSize:12,color:'#374151',flex:1}}>{l}</span>
                <span style={{fontSize:12,fontWeight:700,color:'#111827'}}>{p}</span>
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

// ── WORKFLOWS ───────────────────────────────────────────────────────────────
function Workflows() {
  const { bundle, reload } = useCrm();
  const wfs = bundle?.workflows ?? [];
  const toggle = async (id) => {
    const r = await fetch(`/api/crm/workflows/${id}/toggle`, { method: 'POST', credentials: 'include' });
    if (!r.ok) { alert('Error al cambiar estado'); return; }
    await reload();
  };

  const triggerColors = {
    MEMBER_CREATED: '#10B981',
  };
  const colorTrig = (t) => triggerColors[t] || '#64748b';
  return (
    <div style={{flex:1,overflowY:'auto',padding:'32px 36px',display:'flex',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'}}>Workflows</h1>
            <p style={{color:'#6b7280',fontSize:14,marginTop:4}}>Automatizaciones activas: {wfs.filter(w=>w.activo).length}/{wfs.length || 1}</p>
        </div>
        <button type="button" onClick={() => window.alert('Activa o pausa cada automatización con el interruptor. Un editor visual de flujos se añadirá más adelante.')} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:12,border:'1px solid var(--border)',background:'#fff',color:'var(--accent)',fontFamily:'inherit',fontSize:14,fontWeight:600,cursor:'pointer'}}>
          <Icon name="plus" size={15}/>Ayuda
        </button>
      </div>
      {/* Stats */}
      <div style={{display:'flex',gap:12}}>
        {[
          {label:'Ejecuciones hoy',value:'48',color:'var(--accent)'},
          {label:'Esta semana',value:'312',color:'var(--green)'},
          {label:'Total histórico',value:'623',color:'#8B5CF6'},
        ].map(({label,value,color}) => (
          <div key={label} style={{flex:1,background:'#fff',borderRadius:14,padding:'16px 20px',boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
            <div style={{fontSize:12,color:'#6b7280',marginBottom:4}}>{label}</div>
            <div style={{fontSize:26,fontWeight:800,color,letterSpacing:'-1px'}}>{value}</div>
          </div>
        ))}
      </div>
      {/* Workflow cards */}
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        {wfs.map(w => (
          <div key={w.id} style={{
            background:'#fff',borderRadius:16,padding:'20px 24px',
            boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',
            opacity:w.activo?1:0.6,transition:'opacity 0.2s'
          }}>
            <div style={{display:'flex',alignItems:'flex-start',gap:16}}>
              <div style={{
                width:44,height:44,borderRadius:12,
                background:w.activo?'var(--accent-light)':'#F1F5F9',
                color:w.activo?'var(--accent)':'#9ca3af',
                display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0
              }}>
                <Icon name="zap" size={20}/>
              </div>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                  <div style={{fontWeight:700,fontSize:15,color:'#111827'}}>{w.nombre}</div>
                  {w.activo ? (
                    <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:999,background:'var(--green-light)',color:'var(--green)'}}>ACTIVO</span>
                  ) : (
                    <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:999,background:'#F1F5F9',color:'#9ca3af'}}>PAUSADO</span>
                  )}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <div style={{
                      fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:999,
                      background:`${colorTrig(w.trigger)}15`,
                      color:colorTrig(w.trigger)
                    }}>⚡ {w.trigger}</div>
                    <Icon name="arrow_right" size={14} style={{color:'#9ca3af'}}/>
                    <div style={{fontSize:12,color:'#374151',fontWeight:500}}>→ {w.accion}</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:16,marginTop:10}}>
                  <span style={{fontSize:12,color:'#9ca3af'}}>{w.ejecuciones} ejecuciones</span>
                  <span style={{fontSize:12,color:'#9ca3af'}}>Última: {w.ultima}</span>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                <button type="button" onClick={() => window.alert('Configura el disparador desde la base de datos o el panel avanzado si lo necesitas; aquí puedes activar o pausar cada flujo.')} style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',color:'#6b7280',fontFamily:'inherit',fontSize:12}} title="Información"><Icon name="edit" size={14}/></button>
                {/* Toggle */}
                <div onClick={() => toggle(w.id)} style={{
                  width:44,height:24,borderRadius:12,cursor:'pointer',
                  background:w.activo?'var(--green)':'#D1D5DB',
                  position:'relative',transition:'background 0.2s',flexShrink:0
                }}>
                  <div style={{
                    width:18,height:18,borderRadius:'50%',background:'#fff',
                    position:'absolute',top:3,
                    left:w.activo?23:3,transition:'left 0.2s',
                    boxShadow:'0 1px 4px rgba(0,0,0,0.2)'
                  }}/>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── APP ROOT ─────────────────────────────────────────────────────────────────
const CRM_SECTION_IDS = ['dashboard','socios','equipos','cobros','calendario','informes','workflows'] as const;
type SectionId = (typeof CRM_SECTION_IDS)[number]

function CrmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { loading, error, bundle } = useCrm()

  const tabRaw = searchParams.get('tab') ?? ''
  const active: SectionId = CRM_SECTION_IDS.includes(tabRaw as SectionId)
    ? (tabRaw as SectionId)
    : 'dashboard'

  useEffect(() => {
    const t = searchParams.get('tab')
    if (!t || !CRM_SECTION_IDS.includes(t as SectionId)) {
      router.replace('/?tab=dashboard', { scroll: false })
    }
  }, [router, searchParams])

  const setActive = useCallback(
    (id: string) => {
      if (!CRM_SECTION_IDS.includes(id as SectionId)) return
      router.replace(`/?tab=${encodeURIComponent(id)}`, { scroll: false })
    },
    [router]
  )

  const screens = {
    dashboard: Dashboard,
    socios: Socios,
    equipos: Equipos,
    cobros: Cobros,
    calendario: Calendario,
    informes: Informes,
    workflows: Workflows,
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
          <button type="button" style={{padding:8,borderRadius:10,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',color:'#6b7280',position:'relative'}}>
            <Icon name="bell" size={18}/>
            <span style={{position:'absolute',top:5,right:5,width:8,height:8,borderRadius:'50%',background:'var(--red)',border:'2px solid #fff'}}></span>
          </button>
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

// @ts-nocheck
'use client'

import { WorkflowsSection } from './WorkflowsSection'
import { CuotasSection } from './CuotasSection'
import { BancoSection } from './BancoSection'
import { EntrenamientoSection } from './EntrenamientoSection'
import { ClubSettingsModal } from './ClubSettingsModal'
import { MiCuentaModal } from './MiCuentaModal'
import { HermesAgentSection } from './HermesAgentSection'
import { PaymentReminderButton } from './PaymentReminderButton'
import { InviteLinkButton } from './InviteLinkButton'
import { track } from '@/lib/analytics/umami'
import { formatMoney } from '@/lib/format-money'
import {
  ESTADO_ASIENTO, ORIGEN_ASIENTO, NATURALEZA_CUENTA, PESTANAS_CONTABLES, etiqueta,
} from '@/lib/accounting-labels'
import './crm-vars.css'
import { Plus_Jakarta_Sans } from 'next/font/google'
import React, {
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
  useContext,
  useRef,
  createContext,
  type ReactNode,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { canAccessCrmSection, normalizeRole, ROLE_LABEL } from '@/lib/rbac'
import { isSectionEnabled } from '@/lib/crm-modules'
import {
  emptyRegistrationValues,
  getDefaultRegistrationFields,
  validateRegistrationSubmission,
} from '@/lib/registration-fields'
import { RegistrationFieldsForm } from '@/components/registration/RegistrationFieldsForm'
import { MemberCombobox } from '@/components/crm/MemberCombobox'
import { MembersCsvImportModal } from '@/components/crm/MembersCsvImportModal'
import { RegistrationFieldsTab } from '@/components/crm/RegistrationFieldsTab'

/**
 * Opciones de un diálogo de confirmación.
 *
 * Una confirmación genérica («¿Confirmar acción?» + «Aceptar») se acepta sin
 * leerla. Cuando lo que hay detrás mueve dinero o borra trabajo, el diálogo
 * tiene que decir QUÉ va a pasar en el título, nombrar la acción en el botón, y
 * pintarse en rojo si no hay marcha atrás.
 */
type ConfirmOptions = {
  /** Encabezado: la pregunta concreta, no «Confirmar acción». */
  title?: string
  message: string
  /** Texto del botón que ejecuta. Debe nombrar la acción: «Emitir 24 facturas». */
  confirmLabel?: string
  cancelLabel?: string
  /** Acción sin marcha atrás: botón rojo y foco inicial en Cancelar. */
  danger?: boolean
}

type CrmCtx = {
  bundle: Record<string, unknown> | null
  reload: () => Promise<unknown>
  loading: boolean
  error: string | null
  fmtMoney: (n: number) => string
  showAlert: (message: string, title?: string) => void
  showConfirm: (opts: string | ConfirmOptions) => Promise<boolean>
}

const CrmContext = createContext<CrmCtx | null>(null);
function useCrm(): CrmCtx {
  const c = useContext(CrmContext);
  if (!c) throw new Error('CrmContext');
  return c;
}

/**
 * Panel flotante anclado al viewport (menú contextual / dropdown "⋮"): se mide
 * antes de pintarse y se recoloca para que NUNCA se corte con los bordes de la
 * ventana; si es más alto que la pantalla, se limita con scroll interno.
 * `anchor` admite { top, left } (punto del ratón) o { top, right } (dropdown).
 */
function ViewportMenu({ anchor, style, children, ...rest }) {
  const ref = useRef(null)
  const [fit, setFit] = useState(null)
  useLayoutEffect(() => { setFit(null) }, [anchor.top, anchor.left, anchor.right])
  useLayoutEffect(() => {
    if (fit) return
    const el = ref.current
    if (!el) return
    const M = 8 // margen mínimo con el borde de la ventana
    const vw = window.innerWidth
    const vh = window.innerHeight
    const r = el.getBoundingClientRect()
    let top = r.top
    let left = r.left
    let maxHeight
    if (r.height > vh - M * 2) { top = M; maxHeight = vh - M * 2 }
    else if (r.bottom > vh - M) top = vh - M - r.height
    if (top < M) top = M
    if (r.width > vw - M * 2) left = M
    else if (r.right > vw - M) left = vw - M - r.width
    if (left < M) left = M
    setFit({ top, left, maxHeight })
  }, [fit])
  const pos = fit
    ? {
        top: fit.top,
        left: fit.left,
        right: 'auto',
        maxHeight: fit.maxHeight,
        overflowY: fit.maxHeight ? 'auto' : undefined,
        visibility: 'visible',
      }
    : { top: anchor.top, left: anchor.left, right: anchor.right, visibility: 'hidden' }
  return (
    <div ref={ref} {...rest} style={{ position: 'fixed', ...style, ...pos }}>
      {children}
    </div>
  )
}

function CrmProvider({ children }: { children: ReactNode }) {
  const [bundle, setBundle] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popup, setPopup] = useState<{
    kind: 'alert' | 'confirm'
    message: string
    title?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
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
  // Dos decimales siempre: es dinero y tiene que cuadrar con el extracto.
  const fmtMoney = useCallback(
    (n: number) => formatMoney(n, String(bundle?.currency ?? 'EUR')),
    [bundle?.currency],
  );

  const showAlert = useCallback((message: string, title?: string) => {
    setPopup({ kind: 'alert', message, title })
  }, [])

  const showConfirm = useCallback((opts: string | ConfirmOptions) => {
    const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts
    return new Promise<boolean>((resolve) => {
      setPopup({
        kind: 'confirm',
        message: o.message,
        title: o.title,
        confirmLabel: o.confirmLabel,
        cancelLabel: o.cancelLabel,
        danger: o.danger,
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

  // Escape cierra sin ejecutar. Sin esto, la única salida de un diálogo abierto
  // por error es acertarle al botón correcto con el ratón.
  useEffect(() => {
    if (!popup) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); closePopup(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [popup, closePopup])

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
            aria-labelledby="crm-dialog-title"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#fff',
              borderRadius: 14,
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 24px 50px rgba(15,23,42,0.24)',
              padding: 22,
            }}
          >
            <div
              id="crm-dialog-title"
              style={{ fontSize: 17, fontWeight: 800, color: '#1c1917', marginBottom: 8 }}
            >
              {popup.title || (popup.kind === 'confirm' ? 'Confirmar acción' : 'Aviso')}
            </div>
            {/* pre-line: los mensajes de dos frases se escriben con salto de línea
                y antes salían todos pegados en un párrafo corrido. */}
            <div
              style={{
                fontSize: 14,
                color: '#57534e',
                lineHeight: 1.5,
                marginBottom: 18,
                whiteSpace: 'pre-line',
              }}
            >
              {popup.message}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              {popup.kind === 'confirm' && (
                <button
                  type="button"
                  // En lo irreversible el foco arranca en la salida segura: un
                  // Intro por inercia cancela, no ejecuta.
                  autoFocus={popup.danger === true}
                  onClick={() => closePopup(false)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: '#fff',
                    color: '#57534e',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                  }}
                >
                  {popup.cancelLabel || 'Cancelar'}
                </button>
              )}
              <button
                type="button"
                autoFocus={popup.danger !== true}
                onClick={() => closePopup(true)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: popup.danger ? 'var(--red, #b3261e)' : 'var(--accent)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                }}
              >
                {popup.confirmLabel || 'Aceptar'}
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

function BarChart({ data, secondaryData = [], labels, color = "#3B82F6", secondaryColor = "#EF4444", height = 170, serieLabel = 'Ingresos', secondarySerieLabel = 'Gastos' }) {
  const safeData = data && data.length ? data : [0];
  const safeSecondary = secondaryData.length === safeData.length ? secondaryData : safeData.map(() => 0);
  const safeLabels = labels && labels.length === safeData.length ? labels : safeData.map(() => '');
  const max = Math.max(1, ...safeData, ...safeSecondary);
  const slotCount = safeData.length;
  const groupW = 62;
  const chartW = slotCount * groupW;
  const svgHeight = height - 26;
  const baseY = svgHeight - 8;
  const barMaxH = svgHeight - 42;
  return (
    <div style={{ width: '100%' }}>
      <svg width="100%" height={svgHeight} viewBox={`0 0 ${chartW} ${svgHeight}`} preserveAspectRatio="none">
        {[0, 1, 2, 3].map((r) => {
          const y = 12 + r * ((baseY - 12) / 3);
          return <line key={r} x1="0" y1={y} x2={chartW} y2={y} stroke="#ebe3d8" strokeWidth="1" />;
        })}
        {safeData.map((v, i) => {
          const v2 = safeSecondary[i] ?? 0;
          const h1 = max > 0 ? (v / max) * barMaxH : 0;
          const h2 = max > 0 ? (v2 / max) * barMaxH : 0;
          const groupX = i * groupW;
          const x = groupX + 11;
          const y1 = baseY - h1;
          const y2 = baseY - h2;
          return (
            <g key={i}>
              <rect x={x} y={y1} width="16" height={h1} rx="5" fill={color} opacity="0.9" />
              <rect x={x + 24} y={y2} width="16" height={h2} rx="5" fill={secondaryColor} opacity="0.88" />
              <rect x={groupX} y={12} width={groupW} height={baseY - 4} fill="transparent">
                <title>{secondaryData.length
                  ? `${safeLabels[i]} · ${serieLabel}: ${Math.round(v)} · ${secondarySerieLabel}: ${Math.round(v2)}`
                  : `${safeLabels[i]} · ${serieLabel}: ${Math.round(v)}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          padding: '0 18px',
        }}
      >
        {safeLabels.map((label, i) => (
          <span
            key={`${label}-${i}`}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 600,
              color: '#78716c',
              letterSpacing: '0.01em',
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Evolución en el tiempo (línea + área). Para series mensuales tipo "altas del año". */
function LineAreaChart({ data, labels, color = '#2563eb', height = 200 }) {
  const safeData = data && data.length ? data.map((v) => Math.max(0, Number(v) || 0)) : [0]
  const safeLabels = labels && labels.length === safeData.length ? labels : safeData.map(() => '')
  const max = Math.max(1, ...safeData)
  const stepW = 64
  const chartW = safeData.length * stepW
  const svgHeight = height - 26
  const baseY = svgHeight - 10
  const topPad = 14
  const plotH = baseY - topPad

  const points = safeData.map((v, i) => ({
    x: i * stepW + stepW / 2,
    y: baseY - (v / max) * plotH,
    v,
  }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`

  return (
    <div style={{ width: '100%' }}>
      <svg width="100%" height={svgHeight} viewBox={`0 0 ${chartW} ${svgHeight}`} preserveAspectRatio="none">
        {[0, 1, 2, 3].map((r) => {
          const y = topPad + r * (plotH / 3)
          return <line key={r} x1="0" y1={y} x2={chartW} y2={y} stroke="#ebe3d8" strokeWidth="1" />
        })}
        <path d={areaPath} fill={color} opacity="0.12" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke={color} strokeWidth="2.5" />
            <rect x={i * stepW} y={topPad} width={stepW} height={plotH + 10} fill="transparent">
              <title>{`${safeLabels[i]}: ${p.v}`}</title>
            </rect>
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {safeLabels.map((label, i) => (
          <span key={`${label}-${i}`} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#78716c', letterSpacing: '0.01em' }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function DonutChart({ segments, size = 100 }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total <= 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={size * 0.3} fill="none" stroke="#ebe3d8" strokeWidth={size * 0.12} />
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
    cuotas: <><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4a2 2 0 0 1 0 4h-2"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    reports: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    workflows: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></>,
    whatsapp: <><path d="M20 11.2c0 4.6-3.8 8.3-8.5 8.3-1.3 0-2.6-.3-3.8-.9L3 20l1.5-4.5c-.7-1.3-1-2.7-1-4.3C3.5 6.6 7.3 3 12 3s8 3.6 8 8.2z"/><path d="M8.8 9.5c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .5.4.2.4.6 1.4.7 1.6.1.2.1.4 0 .6-.1.2-.2.3-.4.5-.2.2-.3.3-.4.5-.1.2 0 .4.1.5.2.2.9 1.5 2.3 2 .4.2.7.1.9 0 .2-.1.6-.7.8-.9.2-.2.4-.2.6-.1.2.1 1.3.6 1.6.7.2.1.4.2.4.4 0 .2 0 1.1-.7 1.7-.7.6-1.6.6-2.2.5-.6-.1-3.1-1.2-4.5-3.8-.3-.5-.8-1.6-.8-2.3 0-.6.3-.9.4-1.1z"/></>,
    hermes: <><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></>,
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
    entrenamiento: <><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/><circle cx="12" cy="12" r="2.4"/></>,
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
    Inactivo: { bg: '#f4efe8', color: '#78716c', label: 'Inactivo' },
    Moroso: { bg: 'var(--red-light)', color: 'var(--red)', label: 'Moroso' },
    Pagado: { bg: 'var(--green-light)', color: 'var(--green)', label: 'Pagado' },
    Pendiente: { bg: 'var(--amber-light)', color: 'var(--amber)', label: 'Pendiente' },
    'Pago parcial': { bg: 'var(--accent-pill)', color: 'var(--accent)', label: 'Pago parcial' },
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
// Estructura de navegación del roadmap: 7 secciones principales.
// Admin, Contabilidad y Configuración agrupan submódulos desplegables.
const NAV = [
  { id: 'dashboard', label: 'Inicio', icon: 'dashboard' },
  { id: 'calendario', label: 'Calendario', icon: 'calendar' },
  { id: 'entrenamiento', label: 'Entrenamiento', icon: 'entrenamiento' },
  { id: 'whatsapp', label: 'Chat', icon: 'whatsapp' },
  { id: 'socios', label: 'Socios', icon: 'users' },
  {
    id: 'grp-admin', label: 'Admin', icon: 'teams',
    children: [
      { id: 'admin-sumario', label: 'Sumario' },
      { id: 'organigrama', label: 'Organigrama' },
      { id: 'contactos', label: 'Contactos' },
      { id: 'asistencia', label: 'Asistencia' },
      { id: 'personal', label: 'Personal' },
    ],
  },
  {
    id: 'grp-conta', label: 'Contabilidad', icon: 'billing',
    children: [
      { id: 'contabilidad', label: 'Sumario' },
      { id: 'facturas', label: 'Facturas' },
      { id: 'banco', label: 'Banco' },
      { id: 'cuotas', label: 'Cuotas' },
      { id: 'impagos', label: 'Impagos' },
      { id: 'productos', label: 'Productos' },
      { id: 'descuentos', label: 'Descuentos' },
      { id: 'informes', label: 'Informes' },
    ],
  },
  {
    id: 'grp-confi', label: 'Configuración', icon: 'workflows',
    children: [
      { id: 'workflows', label: 'Flujos' },
      { id: 'forms', label: 'Forms' },
      { id: 'hermes', label: 'Bot (Hermes)' },
      { id: 'api', label: 'API' },
    ],
  },
];

function Sidebar({ active, setActive, onOpenClubSettings, onOpenMiCuenta, abierto = false }) {
  const { bundle } = useCrm();
  const role = normalizeRole(bundle?.user?.role)
  const features = bundle?.features
  // Visible = permitido por rol (RBAC) Y su módulo activado en el plan del club.
  const canShow = (id) => canAccessCrmSection(role, id) && isSectionEnabled(id, features)
  // Filtra: en grupos, solo los hijos visibles; el grupo se oculta si queda vacío.
  const visibleNav = NAV
    .map((item) =>
      item.children
        ? { ...item, children: item.children.filter((c) => canShow(c.id)) }
        : item,
    )
    .filter((item) => (item.children ? item.children.length > 0 : canShow(item.id)))
  const groupOfActive = NAV.find((item) => item.children?.some((c) => c.id === active))?.id ?? null
  const [openGroups, setOpenGroups] = useState(() => new Set(groupOfActive ? [groupOfActive] : []))
  useEffect(() => {
    if (groupOfActive) {
      setOpenGroups((prev) => (prev.has(groupOfActive) ? prev : new Set([...prev, groupOfActive])))
    }
  }, [groupOfActive])
  const pending = bundle?.kpis?.cobrosPendientes ?? 0;
  return (
    <div className={abierto ? 'sidebar crm-sidebar-abierto' : 'sidebar'} style={{
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
          }}>{bundle?.club?.name || 'ProClubCRM'}</div>
          <div style={{
            color:'#78716c',fontSize:11,fontWeight:700,
            letterSpacing:'0.08em',marginTop:6,textTransform:'uppercase'
          }}>Sistema de gestión</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{flex:1,padding:'4px 0 12px',overflowY:'auto',display:'flex',flexDirection:'column',gap:2}}>
        {visibleNav.map(item => {
          const isGroup = Array.isArray(item.children)
          const isOpen = isGroup && openGroups.has(item.id)
          const hasActiveChild = isGroup && item.children.some((c) => c.id === active)
          const isActive = !isGroup && active === item.id;
          return (
            <div key={item.id}>
              <button
                type="button"
                onClick={() => {
                  if (isGroup) {
                    setOpenGroups((prev) => {
                      const next = new Set(prev)
                      if (next.has(item.id)) next.delete(item.id)
                      else next.add(item.id)
                      return next
                    })
                  } else {
                    setActive(item.id)
                  }
                }}
                title={item.label}
                style={{
                  display:'flex',alignItems:'center',gap:12,
                  padding:'12px 24px',
                  border:'none',cursor:'pointer',
                  borderLeft: isActive || hasActiveChild ? '4px solid var(--accent)' : '4px solid transparent',
                  background:isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                  color:isActive || hasActiveChild ? 'var(--sidebar-active)' : 'var(--sidebar-text)',
                  fontFamily:'inherit',fontSize:14,fontWeight:isActive || hasActiveChild ? 600 : 500,
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
                    e.currentTarget.style.color = hasActiveChild ? 'var(--sidebar-active)' : 'var(--sidebar-text)'
                  }
                }}
              >
                <span style={{
                  opacity:isActive || hasActiveChild ? 1 : 0.9,flexShrink:0,display:'inline-flex'
                }}>
                  <Icon name={item.icon} size={18}/>
                </span>
                <span style={{flex:1}}>{item.label}</span>
                {item.id === 'grp-conta' && pending > 0 && (
                  <span style={{
                    background:'var(--red)',color:'#fff',
                    fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:999
                  }}>{pending > 99 ? '99+' : pending}</span>
                )}
                {isGroup && (
                  <span style={{
                    display:'inline-flex',transition:'transform 0.15s',
                    transform:isOpen ? 'rotate(90deg)' : 'rotate(0deg)',opacity:0.6
                  }}>
                    <Icon name="chevron" size={14}/>
                  </span>
                )}
              </button>
              {isGroup && isOpen && (
                <div style={{display:'flex',flexDirection:'column',gap:1,padding:'2px 0 6px'}}>
                  {item.children.map((child) => {
                    // Un enlace externo nunca se marca como pantalla activa del
                    // CRM: si no, se resaltarían dos entradas del mismo grupo.
                    const childActive = !child.href && active === child.id
                    return (
                      <button
                        key={child.href || child.id}
                        type="button"
                        onClick={() => {
                          if (child.href) window.location.href = child.href
                          else setActive(child.id)
                        }}
                        title={child.label}
                        style={{
                          display:'flex',alignItems:'center',gap:10,
                          padding:'8px 24px 8px 54px',
                          border:'none',cursor:'pointer',
                          background:childActive ? 'var(--sidebar-active-bg)' : 'transparent',
                          color:childActive ? 'var(--sidebar-active)' : 'var(--sidebar-text)',
                          fontFamily:'inherit',fontSize:13,fontWeight:childActive ? 600 : 500,
                          textAlign:'left',width:'100%',transition:'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (!childActive) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                            e.currentTarget.style.color = 'var(--sidebar-text-hover)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!childActive) {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--sidebar-text)'
                          }
                        }}
                      >
                        <span style={{flex:1}}>{child.label}</span>
                        {child.id === 'contabilidad' && !child.href && pending > 0 && (
                          <span style={{
                            background:'var(--red)',color:'#fff',
                            fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:999
                          }}>{pending > 99 ? '99+' : pending}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
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
                color:'#78716c',fontSize:11,fontWeight:700,
                letterSpacing:'0.06em',textTransform:'uppercase',marginTop:2
              }}>{ROLE_LABEL[role] || 'Socio'}</div>
            </div>
            <span aria-hidden style={{color:'#78716c',fontSize:14,flexShrink:0,opacity:0.7}}>⚙</span>
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
                color:'#78716c',fontSize:11,fontWeight:700,
                letterSpacing:'0.06em',textTransform:'uppercase',marginTop:2
              }}>{ROLE_LABEL[role] || 'Socio'}</div>
            </div>
          </div>
        )}

        {onOpenMiCuenta && (
          <button
            type="button"
            onClick={onOpenMiCuenta}
            style={{
              display:'flex',alignItems:'center',gap:12,width:'100%',
              padding:'12px 24px',border:'none',cursor:'pointer',
              background:'transparent',color:'var(--sidebar-text)',
              fontFamily:'inherit',fontSize:14,fontWeight:500,textAlign:'left',
              transition:'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#ffffff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sidebar-text)' }}
          >
            <Icon name="users" size={18}/>
            <span>Mi cuenta</span>
          </button>
        )}

        <button
          type="button"
          onClick={async () => {
            // MT: no dependemos del redirect de servidor (usa NEXTAUTH_URL, que
            // en multi-tenant no es una URL única) — cierra sesión y navega en el
            // mismo origen, conservando la cookie de tenant hacia /login del club.
            await signOut({ redirect: false })
            window.location.href = '/login'
          }}
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
  const clubName = (bundle?.club?.name || 'ProClubCRM').trim() || 'ProClubCRM'
  const overdueCount = kp?.facturasVencidas ?? 0
  const pendingCount = kp?.cobrosPendientes ?? 0
  const fechaLarga = meta.toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const resumenHoy =
    overdueCount > 0
      ? `Tienes ${overdueCount} factura${overdueCount === 1 ? '' : 's'} vencida${overdueCount === 1 ? '' : 's'} por revisar.`
      : pendingCount > 0
        ? `${pendingCount} cobro${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'} de gestionar.`
        : 'Todo al día por aquí. ¡Buen trabajo!'
  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--surface)'}}>
      <div className="crm-contenido" style={{maxWidth:1280,margin:'0 auto',padding:'32px 40px 56px',display:'flex',flexDirection:'column',gap:28}}>
        {/* Cabecera cálida con resumen del día en lenguaje natural */}
        <div>
          <div style={{fontSize:13,color:'var(--text-muted)',fontWeight:600,textTransform:'capitalize'}}>{fechaLarga}</div>
          <h1 style={{margin:'6px 0 0',fontSize:26,fontWeight:700,letterSpacing:'-0.02em',color:'var(--text-primary)'}}>Hola, {clubName}</h1>
          <p style={{margin:'6px 0 0',fontSize:15,color:'var(--text-secondary)'}}>{resumenHoy}</p>
        </div>

        {/* KPIs: números claros, sin gráficos decorativos; aviso solo donde hay que actuar */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',
          gap:20
        }}>
          <KPICard
            label="Socios activos"
            value={String(kp?.sociosActivos ?? 0)}
            sub="Altas activas en el club"
            icon="users"
            color={ACCENT_SOFT}
          />
          <KPICard
            label="Cobros pendientes"
            value={kp ? fmtMoney(cobrosPendMonto) : '—'}
            sub={`${pendingCount} factura${pendingCount === 1 ? '' : 's'} por cobrar`}
            icon="billing"
            color={AMBER}
            badge={pendingCount > 0 ? { kind:'warning', text:'En espera' } : null}
          />
          <KPICard
            label="Ingresos del mes"
            value={kp ? fmtMoney(kp.ingresosMes) : '—'}
            sub="Ingresos registrados"
            icon="reports"
            color={GREEN}
          />
          <KPICard
            label="Facturas vencidas"
            value={String(overdueCount)}
            sub={overdueCount > 0 ? 'Requieren atención' : 'Todo en orden'}
            icon="billing"
            color={overdueCount > 0 ? RED : GREEN}
            badge={overdueCount > 0 ? { kind:'danger', text:'Revisar' } : null}
          />
        </div>

        {/* Bento: chart (8) + donut (4) — cada card a su altura natural (sin estirar) */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'minmax(0, 2fr) minmax(0, 1fr)',
          gap:24,
          alignItems:'start'
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
                  segments={donut.length ? donut.map(d => ({ label: d.label, value: Math.max(d.value, 1), color: d.color })) : [{ label: '—', value: 1, color: '#ebe3d8' }]}
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
                onClick={() => setActive('facturas')}
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

// ── SECCIONES DEL ROADMAP ───────────────────────────────────────────────────

/** Envoltorio común de las secciones nuevas (mismo layout que el resto del CRM). */
function SectionShell({ title, subtitle, actions, children }) {
  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--surface)'}}>
      <div style={{maxWidth:1280,margin:'0 auto',padding:'32px 40px 56px',display:'flex',flexDirection:'column',gap:28}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:24,flexWrap:'wrap'}}>
          <div>
            <h1 style={{fontSize:28,fontWeight:700,color:'var(--text-primary)',letterSpacing:'-0.02em',margin:0,lineHeight:1.1}}>{title}</h1>
            {subtitle && <p style={{color:'var(--text-secondary)',fontSize:14,marginTop:6,margin:0}}>{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </div>
  )
}

/** Módulos del roadmap aún sin construir: tarjeta clara con el porqué. */
function PlaceholderSection({ title, subtitle, note, linkHref, linkLabel }) {
  return (
    <SectionShell title={title} subtitle={subtitle}>
      <div style={{
        background:'var(--surface-card)',border:'1px dashed var(--border-strong)',borderRadius:14,
        padding:'40px 32px',textAlign:'center',color:'var(--text-secondary)',fontSize:14,
        display:'flex',flexDirection:'column',alignItems:'center',gap:10
      }}>
        <div style={{fontSize:15,fontWeight:600,color:'var(--text-primary)'}}>En construcción</div>
        <p style={{margin:0,maxWidth:520}}>{note}</p>
        {linkHref && (
          <a href={linkHref} style={{color:'var(--accent)',fontWeight:600,fontSize:13,marginTop:6}}>{linkLabel || 'Abrir'} →</a>
        )}
      </div>
    </SectionShell>
  )
}

// ── ADMIN · SUMARIO (dashboard demográfico) ────────────────────────────────
function AdminSumario() {
  const { bundle } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/crm/admin-summary', { credentials: 'include', cache: 'no-store' })
        if (!r.ok) { if (!cancelled) setError('No se pudo cargar el resumen'); return }
        const j = await r.json()
        if (!cancelled) setData(j)
      } catch {
        if (!cancelled) setError('No se pudo cargar el resumen')
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (role !== 'ADMIN') return null

  const GENDER_COLORS = { Masculino: '#2563eb', Femenino: '#e11d48', Otro: '#f59e0b', 'Sin datos': '#d8cdbd' }
  const MES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']

  const generoConDato = (data?.gender ?? []).filter((g) => g.label !== 'Sin datos')
  const generoDominante = generoConDato[0] ?? null
  const generoTotal = generoConDato.reduce((a, g) => a + g.count, 0)

  return (
    <SectionShell title="Sumario" subtitle="Datos y características de los jugadores del club">
      {error && <p style={{color:'var(--red)',fontSize:14}}>{error}</p>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:20}}>
        <KPICard label="Socios totales" value={String(data?.total ?? '—')} sub={`${data?.activos ?? 0} activos`} icon="users" color="var(--accent-soft)"/>
        <KPICard label="Altas este año" value={String(data?.altasEsteAno ?? '—')} sub={`Año ${new Date().getFullYear()}`} icon="reports" color="var(--green)"/>
        <KPICard label="Edad media" value={data?.avgAge != null ? `${data.avgAge} años` : '—'} sub={data?.sinFechaNacimiento ? `${data.sinFechaNacimiento} sin fecha de nacimiento` : 'Fechas completas'} icon="users" color="var(--amber)"/>
        <KPICard
          label="Género mayoritario"
          value={generoDominante ? generoDominante.label : '—'}
          sub={generoDominante ? `${generoDominante.count} de ${generoTotal} con dato de género` : 'Añade el campo género al formulario'}
          icon="users"
          color="#0891b2"
        />
      </div>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0, 2fr) minmax(0, 1fr)',gap:24,alignItems:'start'}}>
        <div style={{background:'var(--surface-card)',borderRadius:12,padding:32,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Distribución por edad</div>
          <div style={{fontSize:14,color:'var(--text-secondary)',margin:'4px 0 20px'}}>Socios por tramo de edad</div>
          <BarChart
            data={(data?.ages ?? []).map((a) => a.count)}
            labels={(data?.ages ?? []).map((a) => a.label)}
            color="var(--accent-soft)"
            height={200}
          />
        </div>
        <div style={{background:'var(--surface-card)',borderRadius:12,padding:32,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Género</div>
          <div style={{fontSize:14,color:'var(--text-secondary)',margin:'4px 0 20px'}}>Según el formulario de registro</div>
          <div style={{display:'flex',justifyContent:'center',marginBottom:20}}>
            <DonutChart
              size={150}
              segments={(data?.gender ?? []).length
                ? data.gender.map((g) => ({ label: g.label, value: Math.max(g.count, 0.01), color: GENDER_COLORS[g.label] || '#78716c' }))
                : [{ label: '—', value: 1, color: '#ebe3d8' }]}
            />
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {(data?.gender ?? []).map((g) => (
              <div key={g.label} style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{width:10,height:10,borderRadius:'50%',background:GENDER_COLORS[g.label] || '#78716c',flexShrink:0}}></span>
                <span style={{fontSize:13,color:'var(--text-primary)',flex:1}}>{g.label}</span>
                <span style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)'}}>{g.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{background:'var(--surface-card)',borderRadius:12,padding:32,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
          <div>
            <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Altas de este año</div>
            <div style={{fontSize:14,color:'var(--text-secondary)',margin:'4px 0 20px'}}>Evolución mensual de nuevos socios</div>
          </div>
          <span style={{padding:'6px 14px',fontSize:12,fontWeight:700,borderRadius:999,background:'var(--surface-low)',color:'var(--accent)'}}>{new Date().getFullYear()}</span>
        </div>
        <LineAreaChart data={data?.altasPorMes ?? Array(12).fill(0)} labels={MES} color="#15803d" height={210}/>
      </div>
    </SectionShell>
  )
}

// ── ADMIN · ORGANIGRAMA (grupos y subgrupos con herencia) ───────────────────
function GroupTreeNodeRow({ node, depth, selectedId, onSelect, selState, onToggleSel }) {
  const st = selState ? selState(node.id) : 'none'
  return (
    <>
      <div style={{display:'flex',alignItems:'center',paddingLeft:depth * 18}}>
        <input
          type="checkbox"
          checked={st === 'all'}
          ref={(el) => { if (el) el.indeterminate = st === 'some' }}
          onChange={() => onToggleSel && onToggleSel(node.id)}
          title="Seleccionar este grupo y sus subgrupos"
          style={{width:15,height:15,cursor:'pointer',flexShrink:0,margin:'0 4px 0 4px',accentColor:'var(--accent)'}}
        />
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          style={{
            display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0,
            padding:'8px 12px',
            border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',
            background:selectedId === node.id ? 'var(--accent-pill)' : 'transparent',
            color:selectedId === node.id ? 'var(--accent)' : 'var(--text-primary)',
            fontSize:13,fontWeight:selectedId === node.id ? 700 : 500,textAlign:'left',
          }}
        >
          <span style={{opacity:0.55,display:'inline-flex',flexShrink:0}}>
            <Icon name={node.children.length ? 'teams' : 'users'} size={13}/>
          </span>
          <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{node.name}</span>
          <span style={{fontSize:11,color:'var(--text-muted)',fontWeight:600}}>{node.directMemberCount}</span>
        </button>
      </div>
      {node.children.map((child) => (
        <GroupTreeNodeRow key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} selState={selState} onToggleSel={onToggleSel}/>
      ))}
    </>
  )
}

function Organigrama() {
  const { bundle, reload, fmtMoney, showAlert, showConfirm } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  const [tree, setTree] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [members, setMembers] = useState([])
  const [groupName, setGroupName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupParent, setNewGroupParent] = useState('')
  const [addMemberId, setAddMemberId] = useState('')
  const [addMemberLabel, setAddMemberLabel] = useState('')
  const [addMemberRole, setAddMemberRole] = useState('PLAYER')
  const [busy, setBusy] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  // Vista de club (image14) + filtros (image12) + ficha (image11)
  const [overview, setOverview] = useState([])
  const [roleFilter, setRoleFilter] = useState('ALL')
  const [memberFilter, setMemberFilter] = useState('')
  const [ficha, setFicha] = useState(null) // { memberId, name }
  const [fichaSocio, setFichaSocio] = useState(null)
  const [msgModal, setMsgModal] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [planModal, setPlanModal] = useState(false)
  const [planOptions, setPlanOptions] = useState([])
  const [planId, setPlanId] = useState('')
  // Selección para acciones en lote. selMembers = ids de socio (checkbox de socio);
  // selGroups = ids de grupo (checkbox del árbol), para borrar grupos en lote.
  const [selMembers, setSelMembers] = useState(() => new Set())
  const [selGroups, setSelGroups] = useState(() => new Set())
  const [waGroupBusy, setWaGroupBusy] = useState(false)
  /** JID (…@g.us) del chat de WhatsApp del grupo visto; '' si aún no se ha creado. */
  const [waGroupId, setWaGroupId] = useState('')
  const [planTargetIds, setPlanTargetIds] = useState([])
  const [planTargetLabel, setPlanTargetLabel] = useState('')

  const flatGroups = useMemo(() => {
    const out = []
    const walk = (nodes, depth) => {
      for (const n of nodes) {
        out.push({ id: n.id, name: n.name, depth })
        walk(n.children, depth + 1)
      }
    }
    walk(tree, 0)
    return out
  }, [tree])

  const loadTree = useCallback(async () => {
    const r = await fetch('/api/crm/groups', { credentials: 'include', cache: 'no-store' })
    if (!r.ok) return
    const j = await r.json()
    setTree(j.tree || [])
  }, [])

  const loadOverview = useCallback(async () => {
    try {
      const r = await fetch('/api/crm/groups/overview', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      setOverview(Array.isArray(j.members) ? j.members : [])
    } catch { /* noop */ }
  }, [])

  useEffect(() => { void loadOverview() }, [loadOverview])

  // Ficha: datos completos del socio al hacer clic (image11)
  useEffect(() => {
    if (!ficha?.memberId) { setFichaSocio(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/crm/members?id=${encodeURIComponent(ficha.memberId)}`, { credentials: 'include', cache: 'no-store' })
        if (!r.ok || cancelled) return
        const j = await r.json()
        if (!cancelled && j?.socio) setFichaSocio(j.socio)
      } catch { /* noop */ }
    })()
    return () => { cancelled = true }
  }, [ficha?.memberId])

  /** Grupos superiores (ancestros) de un grupo: en ellos también "cuenta" el miembro. */
  const ancestorsOf = useCallback((groupId) => {
    const parentOf = new Map()
    const nameOf = new Map()
    const walk = (nodes) => {
      for (const n of nodes) {
        parentOf.set(n.id, n.parentId || null)
        nameOf.set(n.id, n.name)
        walk(n.children || [])
      }
    }
    walk(tree)
    const out = []
    let current = parentOf.get(groupId)
    const seen = new Set([groupId])
    while (current && !seen.has(current)) {
      seen.add(current)
      out.push({ id: current, name: nameOf.get(current) || '—' })
      current = parentOf.get(current)
    }
    return out
  }, [tree])

  // ── Selección en lote ──────────────────────────────────────────────────
  /** ids de un grupo y TODOS sus descendientes (contención: grupo + subgrupos). */
  const descendantGroupIds = useCallback((groupId) => {
    const childrenOf = new Map()
    const walk = (nodes) => { for (const n of nodes) { childrenOf.set(n.id, n.children || []); walk(n.children || []) } }
    walk(tree)
    const out = new Set()
    const stack = [groupId]
    while (stack.length) {
      const id = stack.pop()
      if (out.has(id)) continue
      out.add(id)
      for (const c of (childrenOf.get(id) || [])) stack.push(c.id)
    }
    return out
  }, [tree])

  /** ids de socio efectivos de un grupo (directos + de sus subgrupos), desde overview. */
  const effectiveMemberIdsOfGroup = useCallback((groupId) => {
    const desc = descendantGroupIds(groupId)
    return overview.filter((m) => (m.groups || []).some((g) => desc.has(g.id))).map((m) => m.id)
  }, [descendantGroupIds, overview])

  function toggleMemberSel(id) {
    setSelMembers((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  /** Marcar/desmarcar un grupo (para borrado en lote y para incluir a sus socios). */
  function toggleGroupSel(groupId) {
    setSelGroups((prev) => { const n = new Set(prev); if (n.has(groupId)) n.delete(groupId); else n.add(groupId); return n })
  }
  /** El checkbox de grupo es binario: seleccionado ('all') o no ('none'). */
  const groupSelState = useCallback((groupId) => (selGroups.has(groupId) ? 'all' : 'none'), [selGroups])

  /** Socios objetivo de las acciones sobre socios: sueltos + efectivos de los grupos marcados. */
  const selectedMemberIds = useMemo(() => {
    const s = new Set(selMembers)
    for (const gid of selGroups) for (const mid of effectiveMemberIdsOfGroup(gid)) s.add(mid)
    return Array.from(s)
  }, [selMembers, selGroups, effectiveMemberIdsOfGroup])

  const clearSel = () => { setSelMembers(new Set()); setSelGroups(new Set()) }

  /** Elimina en lote los grupos/subgrupos marcados (cada uno promociona sus subgrupos a raíz). */
  async function eliminarGruposSeleccionados() {
    const ids = Array.from(selGroups)
    if (ids.length === 0) return
    const ok = await showConfirm(`¿Eliminar ${ids.length} grupo(s) seleccionado(s)? Los subgrupos de cada uno pasan al nivel raíz (no se borran salvo que también estén seleccionados).`).catch(() => false)
    if (!ok) return
    setBulkBusy(true)
    let okCount = 0, failCount = 0
    try {
      for (const gid of ids) {
        try {
          const r = await fetch(`/api/crm/groups/${gid}`, { method: 'DELETE', credentials: 'include' })
          if (r.ok) okCount += 1; else failCount += 1
        } catch { failCount += 1 }
      }
      if (selectedId && selGroups.has(selectedId)) setSelectedId('')
      setSelGroups(new Set())
      await Promise.all([loadTree(), loadOverview()])
      void reload().catch(() => {})
      showAlert(`Grupos eliminados: ${okCount} correctos${failCount ? `, ${failCount} fallidos` : ''}.`)
    } finally { setBulkBusy(false) }
  }

  const haySeleccion = selMembers.size > 0 || selGroups.size > 0
  /** Miembros PROPIOS del grupo visto (sin los heredados de subgrupos). */
  const directMemberCount = members.filter((m) => !m.inherited).length

  /** Botón "Asignar cuota": sobre la selección (grupos+socios marcados) si la hay; si no, el grupo visto. */
  function asignarCuotaAccion() {
    if (haySeleccion) abrirPlanModal(selectedMemberIds, `${selectedMemberIds.length} socio(s) seleccionados`)
    else abrirPlanModal(members.map((m) => m.memberId), `«${groupName}»`)
  }

  /** Botón "Eliminar grupo": todos los grupos/subgrupos marcados si los hay; si no, el grupo visto. */
  async function eliminarGrupoAccion() {
    if (selGroups.size > 0) { await eliminarGruposSeleccionados(); return }
    if (!selectedId) return
    const ok = await showConfirm(`¿Eliminar el grupo «${groupName}»? Sus subgrupos pasan al nivel raíz.`).catch(() => false)
    if (!ok) return
    setBulkBusy(true)
    try {
      const r = await fetch(`/api/crm/groups/${selectedId}`, { method: 'DELETE', credentials: 'include' })
      if (!r.ok) { showAlert('No se pudo eliminar'); return }
      setSelectedId('')
      await Promise.all([loadTree(), loadOverview()])
      void reload().catch(() => {})
    } finally { setBulkBusy(false) }
  }

  /**
   * Botón "Grupo WhatsApp": uno por grupo/subgrupo marcado si los hay; si no, el
   * grupo visto. Cada chat lleva SOLO a los miembros propios de ese grupo (los
   * de los subgrupos tienen el suyo), a diferencia del resto de acciones.
   */
  async function crearGrupoWhatsAppAccion() {
    const ids = selGroups.size > 0 ? Array.from(selGroups) : (selectedId ? [selectedId] : [])
    if (ids.length === 0) return
    const nameOf = (gid) => flatGroups.find((g) => g.id === gid)?.name || groupName || 'grupo'
    const msg = ids.length === 1
      ? `¿Crear el grupo de WhatsApp «${nameOf(ids[0])}» con sus miembros propios (los de sus subgrupos no se incluyen)?`
      : `¿Crear ${ids.length} grupos de WhatsApp, uno por grupo seleccionado, cada uno solo con sus miembros propios?`
    const ok = await showConfirm(msg).catch(() => false)
    if (!ok) return
    setWaGroupBusy(true)
    try {
      const lines = []
      for (const gid of ids) {
        try {
          const r = await fetch(`/api/crm/groups/${gid}/whatsapp-group`, { method: 'POST', credentials: 'include' })
          const j = await r.json().catch(() => ({}))
          if (!r.ok) { lines.push(`«${nameOf(gid)}»: ${j.error || 'no se pudo crear'}`); continue }
          const notas = []
          if ((j.sinTelefono || []).length) notas.push(`${j.sinTelefono.length} sin teléfono`)
          if ((j.noWhatsApp || []).length) notas.push(`sin WhatsApp: ${j.noWhatsApp.join(', ')}`)
          if (j.picture === 'FAILED') notas.push(`sin escudo (${j.pictureError || 'no se pudo poner'})`)
          if (j.picture === 'SKIPPED') notas.push('sin escudo (configúralo en Ajustes del club)')
          lines.push(`«${j.group?.name || nameOf(gid)}»: creado con ${j.participants} participante(s)${notas.length ? ` — ${notas.join('; ')}` : ''}`)
        } catch {
          lines.push(`«${nameOf(gid)}»: error de red`)
        }
      }
      // Refresca el grupo visto: si ya tiene chat, el botón pasa a "Mensaje al grupo".
      await loadMembers(selectedId)
      showAlert(lines.join(' · '))
    } finally { setWaGroupBusy(false) }
  }

  const GROUP_ROLE_FILTERS = [
    { value: 'ALL', label: 'Todos' },
    { value: 'PLAYER', label: 'Jugadores' },
    { value: 'COACH', label: 'Entrenadores' },
    { value: 'FAMILY', label: 'Familiares' },
  ]

  const visibleMembers = members.filter((m) => {
    if (roleFilter !== 'ALL' && m.role !== roleFilter) return false
    if (memberFilter.trim()) {
      const q = memberFilter.trim().toLowerCase()
      if (!m.name.toLowerCase().includes(q) && !(m.email || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const visibleOverview = overview.filter((m) => {
    if (memberFilter.trim()) {
      const q = memberFilter.trim().toLowerCase()
      if (!m.name.toLowerCase().includes(q) && !(m.email || '').toLowerCase().includes(q)) return false
    }
    if (roleFilter !== 'ALL' && !m.groups.some((g) => g.role === roleFilter)) return false
    return true
  })

  const loadMembers = useCallback(async (groupId) => {
    if (!groupId) { setMembers([]); setGroupName(''); setWaGroupId(''); return }
    const r = await fetch(`/api/crm/groups/${groupId}/members`, { credentials: 'include', cache: 'no-store' })
    if (!r.ok) { setMembers([]); setWaGroupId(''); return }
    const j = await r.json()
    setMembers(j.members || [])
    setGroupName(j.group?.name || '')
    setWaGroupId(j.group?.whatsappGroupId || '')
  }, [])

  useEffect(() => { void loadTree() }, [loadTree])
  useEffect(() => { void loadMembers(selectedId) }, [selectedId, loadMembers])

  if (role !== 'ADMIN') return null

  async function crearGrupo() {
    const name = newGroupName.trim()
    if (!name) { showAlert('Pon un nombre al grupo.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/crm/groups', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId: newGroupParent || null }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo crear el grupo'); return }
      setNewGroupName('')
      await loadTree()
      // El calendario y cuotas leen los grupos del bundle global: refréscalo
      // para que "crear evento" vea el grupo nuevo sin recargar la página.
      void reload().catch(() => {})
    } finally { setBusy(false) }
  }

  async function anadirMiembro() {
    if (!selectedId || !addMemberId) { showAlert('Selecciona un grupo y un socio.'); return }
    setBusy(true)
    try {
      const r = await fetch(`/api/crm/groups/${selectedId}/members`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: addMemberId, role: addMemberRole }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo añadir'); return }
      setAddMemberId(''); setAddMemberLabel('')
      await Promise.all([loadMembers(selectedId), loadTree(), loadOverview()])
      void reload().catch(() => {})
    } finally { setBusy(false) }
  }

  async function quitarMiembro(memberId) {
    if (!selectedId) return
    setBusy(true)
    try {
      const r = await fetch(`/api/crm/groups/${selectedId}/members?memberId=${encodeURIComponent(memberId)}`, {
        method: 'DELETE', credentials: 'include',
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo quitar'); return }
      await Promise.all([loadMembers(selectedId), loadTree(), loadOverview()])
      void reload().catch(() => {})
    } finally { setBusy(false) }
  }

  /** Acción en lote sobre TODOS los miembros efectivos del grupo (directos + heredados). */
  async function accionEnLote(action, extra) {
    if (!selectedId || members.length === 0) { showAlert('El grupo no tiene miembros.'); return }
    if (extra?.confirmMessage) {
      const ok = await showConfirm(extra.confirmMessage).catch(() => false)
      if (!ok) return
    }
    setBulkBusy(true)
    try {
      const r = await fetch('/api/crm/members/batch', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: members.map((m) => m.memberId), action, status: extra?.status }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo completar la acción'); return }
      showAlert(`Acción completada: ${j.succeeded ?? 0} correctos, ${j.failed ?? 0} fallidos.`)
    } finally { setBulkBusy(false) }
  }

  /** Mensaje al chat de WhatsApp del grupo (queda en el hilo del Chat). */
  async function enviarMensajeGrupo() {
    const message = msgText.trim()
    if (!selectedId || !message) return
    setBulkBusy(true)
    try {
      const r = await fetch('/api/crm/chat/messages', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: selectedId, message }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo enviar el mensaje'); return }
      setMsgModal(false); setMsgText('')
      showAlert(
        j.viaGroupChat
          ? `Mensaje enviado al grupo de WhatsApp «${groupName}».\nLa conversación queda en la pestaña Chat.`
          : `Mensaje enviado a ${j.sent}/${j.total} miembros.${j.skippedNoPhone ? ` ${j.skippedNoPhone} sin teléfono.` : ''}${j.failed ? ` ${j.failed} fallidos.` : ''}\nLa conversación queda en la pestaña Chat.`,
      )
    } finally { setBulkBusy(false) }
  }

  async function abrirPlanModal(targetIds, label) {
    const ids = Array.from(new Set(targetIds || []))
    if (ids.length === 0) { showAlert('No hay socios seleccionados.'); return }
    setPlanTargetIds(ids)
    setPlanTargetLabel(label || `${ids.length} socio(s) seleccionados`)
    setPlanModal(true)
    if (planOptions.length > 0) return
    try {
      const r = await fetch('/api/crm/membership-plans', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      const plans = (j.plans || []).filter((p) => p.isActive !== false)
      setPlanOptions(plans)
      if (plans[0]?.id) setPlanId(plans[0].id)
    } catch { /* noop */ }
  }

  async function asignarCuota() {
    if (!planId || planTargetIds.length === 0) return
    const ok = await showConfirm({
      title: `Asignar esta cuota a ${planTargetIds.length} socio(s)`,
      message:
        'A cada uno se le emitirá su primera factura y recibirá el aviso de cobro.\n\n' +
        'Si alguno ya tenía otra cuota, se le da de baja y se le vuelve a cobrar la matrícula del plan nuevo.',
      confirmLabel: `Asignar y facturar a ${planTargetIds.length}`,
    }).catch(() => false)
    if (!ok) return
    setBulkBusy(true)
    try {
      const r = await fetch('/api/crm/members/batch', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: planTargetIds, action: 'assign-plan', planId }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo asignar la cuota'); return }
      setPlanModal(false)
      clearSel()
      showAlert(`Cuota asignada: ${j.succeeded ?? 0} correctos, ${j.failed ?? 0} fallidos.`)
    } finally { setBulkBusy(false) }
  }

  const GROUP_ROLE_LABELS = { PLAYER: 'Jugador', COACH: 'Entrenador', FAMILY: 'Familiar' }

  return (
    <SectionShell
      title="Organigrama"
      subtitle="Grupos y subgrupos: cada grupo agrupa a sus miembros y a los de todos sus subgrupos"
    >
      <div style={{display:'grid',gridTemplateColumns:'minmax(240px, 1fr) minmax(0, 2.4fr)',gap:24,alignItems:'start'}}>
        {/* Árbol lateral */}
        <div style={{background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)',padding:16,display:'flex',flexDirection:'column',gap:12}}>
          <button
            type="button"
            onClick={() => setSelectedId('')}
            style={{
              display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 12px',
              border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',
              background:!selectedId ? 'var(--accent-pill)' : 'transparent',
              color:!selectedId ? 'var(--accent)' : 'var(--text-primary)',
              fontSize:13,fontWeight:!selectedId ? 700 : 600,textAlign:'left',
            }}
          >
            <span style={{opacity:0.6,display:'inline-flex'}}><Icon name="users" size={14}/></span>
            Todos los miembros
            <span style={{marginLeft:'auto',fontSize:11,color:'var(--text-muted)',fontWeight:600}}>{overview.length}</span>
          </button>
          <div style={{fontWeight:700,fontSize:14,color:'var(--text-primary)',padding:'4px 8px',borderTop:'1px solid var(--border)',paddingTop:12}}>Grupos</div>
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {tree.length === 0 && (
              <p style={{fontSize:13,color:'var(--text-muted)',padding:'4px 8px'}}>Aún no hay grupos. Crea el primero abajo.</p>
            )}
            {tree.map((node) => (
              <GroupTreeNodeRow key={node.id} node={node} depth={0} selectedId={selectedId} onSelect={setSelectedId} selState={groupSelState} onToggleSel={toggleGroupSel}/>
            ))}
          </div>
          <div style={{borderTop:'1px solid var(--border)',paddingTop:12,display:'flex',flexDirection:'column',gap:8}}>
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Nombre del grupo…"
              style={{padding:'9px 11px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13}}
            />
            <select
              value={newGroupParent}
              onChange={(e) => setNewGroupParent(e.target.value)}
              style={{padding:'9px 11px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,background:'#fff'}}
            >
              <option value="">Grupo raíz (sin padre)</option>
              {flatGroups.map((g) => (
                <option key={g.id} value={g.id}>{`${'— '.repeat(g.depth)}${g.name}`}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !newGroupName.trim()}
              onClick={crearGrupo}
              style={{padding:'9px 12px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',cursor:busy||!newGroupName.trim()?'not-allowed':'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,opacity:busy||!newGroupName.trim()?0.6:1}}
            >
              Crear grupo
            </button>
          </div>
        </div>

        {/* Detalle del grupo */}
        <div style={{background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)',padding:24,minHeight:320}}>
          {!selectedId ? (
            <>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:14}}>
                <div>
                  <div style={{fontWeight:700,fontSize:18,color:'var(--text-primary)'}}>Miembros del club</div>
                  <div style={{fontSize:13,color:'var(--text-secondary)',marginTop:2}}>
                    {visibleOverview.length} de {overview.length} · haz clic en una persona para ver su ficha
                  </div>
                </div>
              </div>
              <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:14}}>
                <input
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  placeholder="Filtrar por nombre o email…"
                  style={{flex:'1 1 200px',padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13}}
                />
                <div style={{display:'flex',gap:4,background:'var(--surface-low)',borderRadius:999,padding:4}}>
                  {GROUP_ROLE_FILTERS.map((f) => (
                    <button key={f.value} type="button" onClick={() => setRoleFilter(f.value)}
                      style={{padding:'6px 12px',borderRadius:999,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,
                        background:roleFilter === f.value ? 'var(--surface-card)' : 'transparent',
                        color:roleFilter === f.value ? 'var(--accent)' : 'var(--text-muted)'}}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column'}}>
                {visibleOverview.length === 0 && (
                  <p style={{fontSize:13,color:'var(--text-muted)',padding:'16px 0'}}>No hay miembros que coincidan con el filtro.</p>
                )}
                {visibleOverview.map((m) => (
                  <div key={m.id} style={{display:'flex',alignItems:'center',gap:8,borderTop:'1px solid var(--border)'}}>
                    <input type="checkbox" checked={selMembers.has(m.id)} onChange={() => toggleMemberSel(m.id)}
                      title="Seleccionar socio"
                      style={{width:16,height:16,cursor:'pointer',flexShrink:0,marginLeft:4,accentColor:'var(--accent)'}}/>
                    <button type="button" onClick={() => setFicha({ memberId: m.id, name: m.name })}
                    style={{display:'flex',alignItems:'center',gap:12,padding:'10px 4px',border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',textAlign:'left',flex:1,minWidth:0}}>
                    <Avatar initials={(m.name || '?').split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()} color="#2563eb" size={32}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.name}</div>
                      <div style={{fontSize:12,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.email || '—'}</div>
                    </div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end',maxWidth:'50%'}}>
                      {m.groups.length === 0 && (
                        <span style={{fontSize:11,color:'var(--text-muted)'}}>Sin grupos</span>
                      )}
                      {m.groups.slice(0, 4).map((g) => (
                        <span key={g.id} title={GROUP_ROLE_LABELS[g.role] || g.role}
                          style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:999,background:'var(--accent-pill)',color:'var(--accent)',whiteSpace:'nowrap'}}>
                          {g.name}{g.role !== 'PLAYER' ? ` · ${(GROUP_ROLE_LABELS[g.role] || g.role)[0]}` : ''}
                        </span>
                      ))}
                      {m.groups.length > 4 && (
                        <span style={{fontSize:11,color:'var(--text-muted)'}}>+{m.groups.length - 4}</span>
                      )}
                    </div>
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:16}}>
                <div>
                  <div style={{fontWeight:700,fontSize:18,color:'var(--text-primary)'}}>{groupName}</div>
                  <div style={{fontSize:13,color:'var(--text-secondary)',marginTop:2}}>
                    {members.length} miembro{members.length === 1 ? '' : 's'} (directos + de sus subgrupos)
                  </div>
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {/* El mensaje va AL chat de WhatsApp del grupo, así que solo
                      tiene sentido una vez creado. Mientras no exista, el hueco
                      lo ocupa el botón de crearlo. */}
                  {waGroupId && selGroups.size === 0 ? (
                    <button type="button" disabled={bulkBusy}
                      title="Envía un mensaje al chat de WhatsApp del grupo"
                      onClick={() => { setMsgText(''); setMsgModal(true) }}
                      style={{padding:'8px 14px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700}}>
                      Mensaje al grupo
                    </button>
                  ) : (
                    <button type="button"
                      disabled={bulkBusy || waGroupBusy || (selGroups.size === 0 && directMemberCount === 0)}
                      title="Crea un chat de WhatsApp solo con los miembros propios de este grupo"
                      onClick={crearGrupoWhatsAppAccion}
                      style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--green)',background:'var(--surface-card)',color:'var(--green)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700}}>
                      {waGroupBusy ? 'Creando…' : (selGroups.size > 0 ? `Crear ${selGroups.size} grupo${selGroups.size === 1 ? '' : 's'} WhatsApp` : 'Crear grupo WhatsApp')}
                    </button>
                  )}
                  <button type="button" disabled={bulkBusy || members.length === 0}
                    onClick={() => accionEnLote('send-payment-reminder', { confirmMessage: `¿Enviar recordatorio de cobro por WhatsApp a los ${members.length} miembros de «${groupName}»?` })}
                    style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--green-light)',color:'var(--green)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700}}>
                    {bulkBusy ? 'Enviando…' : 'Recordar cobros'}
                  </button>
                  <button type="button" disabled={bulkBusy || (haySeleccion ? selectedMemberIds.length === 0 : members.length === 0)}
                    onClick={asignarCuotaAccion}
                    style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-primary)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                    {haySeleccion ? `Asignar cuota (${selectedMemberIds.length})` : 'Asignar cuota'}
                  </button>
                  <button type="button" disabled={bulkBusy || members.length === 0}
                    onClick={() => accionEnLote('set-status', { status: 'ACTIVE', confirmMessage: `¿Marcar como activos a los ${members.length} miembros de «${groupName}»?` })}
                    style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-primary)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                    Marcar activos
                  </button>
                  <button type="button" disabled={bulkBusy}
                    onClick={eliminarGrupoAccion}
                    style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--red)',background:'var(--surface-card)',color:'var(--red)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                    {selGroups.size > 0 ? (bulkBusy ? 'Eliminando…' : `Eliminar ${selGroups.size} grupo${selGroups.size === 1 ? '' : 's'}`) : 'Eliminar grupo'}
                  </button>
                </div>
              </div>

              {/* Filtros por rol y nombre (image12) */}
              <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',paddingBottom:12}}>
                <input
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  placeholder="Filtrar miembros…"
                  style={{flex:'1 1 180px',padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13}}
                />
                <div style={{display:'flex',gap:4,background:'var(--surface-low)',borderRadius:999,padding:4}}>
                  {GROUP_ROLE_FILTERS.map((f) => (
                    <button key={f.value} type="button" onClick={() => setRoleFilter(f.value)}
                      style={{padding:'6px 12px',borderRadius:999,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,
                        background:roleFilter === f.value ? 'var(--surface-card)' : 'transparent',
                        color:roleFilter === f.value ? 'var(--accent)' : 'var(--text-muted)'}}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Añadir miembro */}
              <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap',padding:'12px 0 16px',borderBottom:'1px solid var(--border)'}}>
                <div style={{flex:'1 1 240px'}}>
                  <MemberCombobox
                    value={addMemberId}
                    displayLabel={addMemberLabel}
                    onChange={(memberId, member) => { setAddMemberId(memberId); setAddMemberLabel(member?.nombre || '') }}
                    placeholder="Buscar socio para añadir…"
                  />
                </div>
                <select value={addMemberRole} onChange={(e) => setAddMemberRole(e.target.value)}
                  style={{padding:'10px 11px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,background:'#fff'}}>
                  <option value="PLAYER">Jugador</option>
                  <option value="COACH">Entrenador</option>
                  <option value="FAMILY">Familiar</option>
                </select>
                <button type="button" disabled={busy || !addMemberId} onClick={anadirMiembro}
                  style={{padding:'10px 16px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',cursor:busy||!addMemberId?'not-allowed':'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,opacity:busy||!addMemberId?0.6:1}}>
                  Añadir al grupo
                </button>
              </div>

              {/* Lista de miembros efectivos (clic → ficha) */}
              <div style={{display:'flex',flexDirection:'column'}}>
                {members.length === 0 && (
                  <p style={{fontSize:13,color:'var(--text-muted)',padding:'16px 0'}}>Este grupo aún no tiene miembros.</p>
                )}
                {members.length > 0 && visibleMembers.length === 0 && (
                  <p style={{fontSize:13,color:'var(--text-muted)',padding:'16px 0'}}>Ningún miembro coincide con el filtro.</p>
                )}
                {visibleMembers.map((m) => (
                  <div key={m.memberId} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                    <input type="checkbox" checked={selMembers.has(m.memberId)} onChange={() => toggleMemberSel(m.memberId)}
                      title="Seleccionar socio"
                      style={{width:16,height:16,cursor:'pointer',flexShrink:0,accentColor:'var(--accent)'}}/>
                    <button type="button" onClick={() => setFicha({ memberId: m.memberId, name: m.name })}
                      style={{display:'flex',alignItems:'center',gap:12,flex:1,minWidth:0,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',textAlign:'left',padding:0}}>
                      <Avatar initials={(m.name || '?').split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()} color="#2563eb" size={32}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.name}</div>
                        <div style={{fontSize:12,color:'var(--text-muted)'}}>{m.email || '—'}</div>
                      </div>
                    </button>
                    <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:999,background:'var(--accent-pill)',color:'var(--accent)'}}>
                      {GROUP_ROLE_LABELS[m.role] || m.role}
                    </span>
                    {m.inherited ? (
                      <span title={`Miembro del subgrupo «${m.inheritedFrom}»; quítalo desde ese subgrupo`}
                        style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:999,background:'var(--surface-low)',color:'var(--text-muted)'}}>
                        Subgrupo · {m.inheritedFrom}
                      </span>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => quitarMiembro(m.memberId)}
                        style={{padding:'6px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--red)',cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:600}}>
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Ficha de usuario (image11): datos, grupos, membresía, historial ── */}
      {ficha && (
        <div role="dialog" aria-modal="true" onClick={() => setFicha(null)}
          style={{position:'fixed',inset:0,background:'rgba(28,25,23,0.35)',zIndex:1400,display:'flex',justifyContent:'flex-end'}}>
          <div onClick={(e) => e.stopPropagation()}
            style={{width:380,maxWidth:'92vw',height:'100%',background:'var(--surface-card)',boxShadow:'-8px 0 30px rgba(28,25,23,0.18)',overflowY:'auto',padding:26,display:'flex',flexDirection:'column',gap:18}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontWeight:700,fontSize:16,color:'var(--text-primary)'}}>Ficha del miembro</div>
              <button type="button" onClick={() => setFicha(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)'}}><Icon name="x" size={18}/></button>
            </div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,paddingBottom:14,borderBottom:'1px solid var(--border)'}}>
              <Avatar initials={(ficha.name || '?').split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()} color="#2563eb" size={62}/>
              <div style={{fontWeight:700,fontSize:18,color:'var(--text-primary)',textAlign:'center'}}>{fichaSocio?.nombre || ficha.name}</div>
              {fichaSocio && <Badge status={fichaSocio.estado}/>}
            </div>

            {/* Datos personales */}
            {fichaSocio ? (
              <div style={{display:'flex',flexDirection:'column'}}>
                {[
                  ['Email', fichaSocio.email || '—'],
                  ['Teléfono', fichaSocio.telefono || '—'],
                  ['DNI', fichaSocio.dni || '—'],
                  ['Domicilio', fichaSocio.domicilio || '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{display:'flex',justifyContent:'space-between',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                    <span style={{fontSize:12,color:'var(--text-muted)'}}>{k}</span>
                    <span style={{fontSize:12.5,fontWeight:600,color:'var(--text-primary)',textAlign:'right'}}>{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{fontSize:13,color:'var(--text-muted)'}}>Cargando datos…</p>
            )}

            {/* Grupos (directos + heredados hacia los subgrupos) */}
            <div>
              <div style={{fontSize:12,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Grupos</div>
              {(() => {
                const entry = overview.find((o) => o.id === ficha.memberId)
                const direct = entry?.groups ?? []
                if (direct.length === 0) return <p style={{fontSize:13,color:'var(--text-muted)',margin:0}}>No pertenece a ningún grupo.</p>
                // Cuenta también en los grupos superiores de sus grupos directos.
                const countsIn = direct.flatMap((g) =>
                  ancestorsOf(g.id).map((a) => ({ ...a, via: g.name })),
                ).filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i && !direct.some((g) => g.id === a.id))
                return (
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {direct.map((g) => (
                        <span key={g.id} style={{fontSize:11,fontWeight:700,padding:'4px 11px',borderRadius:999,background:'var(--accent-pill)',color:'var(--accent)'}}>
                          {g.name} · {GROUP_ROLE_LABELS[g.role] || g.role}
                        </span>
                      ))}
                    </div>
                    {countsIn.length > 0 && (
                      <>
                        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>También cuenta en (grupos superiores):</div>
                        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                          {countsIn.map((a) => (
                            <span key={a.id} title={`Por ser miembro de «${a.via}»`}
                              style={{fontSize:11,fontWeight:600,padding:'4px 11px',borderRadius:999,background:'var(--surface-low)',color:'var(--text-secondary)'}}>
                              {a.name}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Membresía / estado */}
            {fichaSocio && (
              <div>
                <div style={{fontSize:12,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Membresía</div>
                <div style={{display:'flex',flexDirection:'column'}}>
                  {[
                    ['Cuota', fichaSocio.membershipPlanName ? `${fichaSocio.membershipPlanName} · ${fmtMoney(fichaSocio.cuota)}` : 'Sin cuota asignada'],
                    ['Próximo vencimiento', fichaSocio.vencimiento ? new Date(fichaSocio.vencimiento).toLocaleDateString('es-ES') : '—'],
                    ['Pendiente de pago', fichaSocio.pendingInvoiceAmount != null ? fmtMoney(fichaSocio.pendingInvoiceAmount) : 'Nada pendiente'],
                  ].map(([k, v]) => (
                    <div key={k} style={{display:'flex',justifyContent:'space-between',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:12,color:'var(--text-muted)'}}>{k}</span>
                      <span style={{fontSize:12.5,fontWeight:600,color:'var(--text-primary)',textAlign:'right'}}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historial */}
            {fichaSocio && (
              <div>
                <div style={{fontSize:12,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>Historial</div>
                <div style={{display:'flex',justifyContent:'space-between',gap:10,padding:'8px 0'}}>
                  <span style={{fontSize:12,color:'var(--text-muted)'}}>Alta en el club</span>
                  <span style={{fontSize:12.5,fontWeight:600,color:'var(--text-primary)'}}>{fichaSocio.fechaAlta ? new Date(fichaSocio.fechaAlta).toLocaleDateString('es-ES') : '—'}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',gap:10,padding:'8px 0'}}>
                  <span style={{fontSize:12,color:'var(--text-muted)'}}>Equipo (legado)</span>
                  <span style={{fontSize:12.5,fontWeight:600,color:'var(--text-primary)'}}>{fichaSocio.equipoNombre || '—'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: mensaje al grupo ── */}
      {msgModal && (
        <div role="dialog" aria-modal="true" onClick={() => { if (!bulkBusy) setMsgModal(false) }}
          style={{position:'fixed',inset:0,background:'rgba(28,25,23,0.4)',zIndex:1400,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div onClick={(e) => e.stopPropagation()} style={{background:'#fff',borderRadius:14,padding:26,width:'100%',maxWidth:440,boxShadow:'var(--card-shadow-lg)'}}>
            <h2 style={{margin:'0 0 6px',fontSize:17,fontWeight:700,color:'var(--text-primary)'}}>Mensaje a «{groupName}»</h2>
            <p style={{margin:'0 0 14px',fontSize:13,color:'var(--text-secondary)'}}>
              Se envía por WhatsApp a los {members.length} miembros del grupo y queda en la pestaña Chat.
            </p>
            <textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Escribe el mensaje…"
              style={{width:'100%',minHeight:100,padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:14,resize:'vertical',boxSizing:'border-box'}}/>
            <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:14}}>
              <button type="button" disabled={bulkBusy} onClick={() => setMsgModal(false)}
                style={{padding:'9px 16px',borderRadius:8,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:600,color:'var(--text-secondary)'}}>
                Cancelar
              </button>
              <button type="button" disabled={bulkBusy || !msgText.trim()} onClick={enviarMensajeGrupo}
                style={{padding:'9px 16px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',cursor:bulkBusy||!msgText.trim()?'not-allowed':'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,opacity:bulkBusy||!msgText.trim()?0.6:1}}>
                {bulkBusy ? 'Enviando…' : 'Enviar al grupo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: asignar cuota al grupo ── */}
      {planModal && (
        <div role="dialog" aria-modal="true" onClick={() => { if (!bulkBusy) setPlanModal(false) }}
          style={{position:'fixed',inset:0,background:'rgba(28,25,23,0.4)',zIndex:1400,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div onClick={(e) => e.stopPropagation()} style={{background:'#fff',borderRadius:14,padding:26,width:'100%',maxWidth:420,boxShadow:'var(--card-shadow-lg)'}}>
            <h2 style={{margin:'0 0 6px',fontSize:17,fontWeight:700,color:'var(--text-primary)'}}>Asignar cuota · {planTargetLabel}</h2>
            <p style={{margin:'0 0 14px',fontSize:13,color:'var(--text-secondary)'}}>
              Se asigna a {planTargetIds.length} socio(s). La cuota activa anterior de cada uno se cancela.
            </p>
            {planOptions.length === 0 ? (
              <p style={{fontSize:13,color:'var(--text-muted)'}}>Cargando planes… (si no aparecen, crea uno en Suscripciones)</p>
            ) : (
              <select value={planId} onChange={(e) => setPlanId(e.target.value)}
                style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:14,background:'#fff',marginBottom:6}}>
                {planOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {fmtMoney(p.amount)}</option>
                ))}
              </select>
            )}
            <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:14}}>
              <button type="button" disabled={bulkBusy} onClick={() => setPlanModal(false)}
                style={{padding:'9px 16px',borderRadius:8,border:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:600,color:'var(--text-secondary)'}}>
                Cancelar
              </button>
              <button type="button" disabled={bulkBusy || !planId} onClick={asignarCuota}
                style={{padding:'9px 16px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',cursor:bulkBusy||!planId?'not-allowed':'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,opacity:bulkBusy||!planId?0.6:1}}>
                {bulkBusy ? 'Asignando…' : 'Asignar cuota'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SectionShell>
  )
}

// ── CONTABILIDAD · IMPAGOS ──────────────────────────────────────────────────
function Impagos() {
  const { bundle, reload, fmtMoney, showAlert, showConfirm } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  const [busyId, setBusyId] = useState('')
  const [buscarImpago, setBuscarImpago] = useState('')
  const [reprogramId, setReprogramId] = useState('')
  const [reprogramDate, setReprogramDate] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  if (!(role === 'ADMIN' || role === 'TREASURER')) return null

  // Los impagos vienen paginados y agrupados por socio del servidor. Antes se
  // derivaban de las 120 facturas mas recientes de /api/crm/data: lo primero que
  // se perdia al pasar de 120 era la deuda MAS ANTIGUA, justo la que hay que
  // reclamar primero, y la pantalla llego a decir «Todo al dia» con deuda viva.
  const [impagosData, setImpagosData] = useState({
    filas: [], total: 0, totalPages: 1, totalDeuda: 0, recibosTotales: 0,
    sociosAfectados: 0, aging: [], antiguedadMedia: 0, topMorosos: [], todosLosIds: [],
  })
  const [impagosPage, setImpagosPage] = useState(1)
  const [impagosLoading, setImpagosLoading] = useState(true)
  const [impagosError, setImpagosError] = useState('')

  const cargarImpagos = useCallback(async (page, q) => {
    setImpagosLoading(true)
    setImpagosError('')
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (q) params.set('q', q)
      const r = await fetch('/api/crm/impagos?' + params.toString(), {
        credentials: 'include', cache: 'no-store',
      })
      if (!r.ok) {
        setImpagosError('No se pudieron cargar los impagos. Comprueba tu conexion y vuelve a intentarlo.')
        return
      }
      setImpagosData(await r.json())
    } catch {
      setImpagosError('No se pudieron cargar los impagos. Comprueba tu conexion y vuelve a intentarlo.')
    } finally {
      setImpagosLoading(false)
    }
  }, [])

  // El buscador espera a que dejes de teclear antes de ir al servidor.
  useEffect(() => {
    const t = setTimeout(() => { void cargarImpagos(impagosPage, buscarImpago.trim()) }, 250)
    return () => clearTimeout(t)
  }, [cargarImpagos, impagosPage, buscarImpago])

  // Al buscar se vuelve a la primera pagina: si no, se busca dentro de la 3.
  useEffect(() => { setImpagosPage(1) }, [buscarImpago])

  const impagos = impagosData.filas
  const totalVencido = Number(impagosData.totalDeuda || 0)
  const vencidasClub = Number(impagosData.recibosTotales || 0)
  const sociosAfectados = Number(impagosData.sociosAfectados || 0)
  const AGING = (impagosData.aging || []).map((a) => ({ label: a.label }))
  const agingAmounts = (impagosData.aging || []).map((a) => Number(a.importe || 0))
  const antiguedadMedia = Number(impagosData.antiguedadMedia || 0)
  const topMorosos = impagosData.topMorosos || []
  const maxMorosoTotal = topMorosos[0]?.total || 1

  /** Reenviar el aviso de cobro a TODOS los socios con impagos. */
  async function reenviarTodos() {
    const ids = [...new Set((impagosData.todosLosIds || []).filter(Boolean))]
    if (ids.length === 0) return
    const ok = await showConfirm({
      title: `Avisar por WhatsApp a ${ids.length} socios`,
      message: 'Los mensajes salen al momento y no se pueden retirar.',
      confirmLabel: `Enviar ${ids.length} avisos`,
    }).catch(() => false)
    if (!ok) return
    setBulkBusy(true)
    try {
      const r = await fetch('/api/crm/members/batch', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: ids, action: 'send-payment-reminder' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudieron enviar los avisos'); return }
      // «3 fallidos» sin decir quiénes ni por qué obliga a repasar la lista
      // socio a socio. Se resuelven los ids contra los nombres, igual que ya
      // hace la pantalla de Socios.
      const okCount = Number(j.succeeded || 0)
      const errCount = Number(j.failed || 0)
      if (errCount > 0 && Array.isArray(j.errors) && j.errors.length > 0) {
        const nombre = (id: string) =>
          impagos.find((x) => x.memberId === id)?.socio || 'un socio'
        const detalle = j.errors
          .slice(0, 4)
          .map((e: { id: string; message: string }) => `${nombre(e.id)}: ${e.message}`)
          .join('\n')
        const resto = j.errors.length > 4 ? `\n…y ${j.errors.length - 4} más.` : ''
        showAlert(
          `${okCount} avisos enviados. No se pudo avisar a ${errCount}:\n\n${detalle}${resto}`,
          'Avisos enviados con incidencias',
        )
      } else {
        showAlert(`Avisos enviados a ${okCount} socio${okCount === 1 ? '' : 's'}.`)
      }
      // La lista tiene que reflejar lo ocurrido sin obligar a recargar a mano.
      await Promise.all([reload(), cargarImpagos(impagosPage, buscarImpago.trim())])
    } finally { setBulkBusy(false) }
  }

  async function reenviarAviso(c) {
    const ok = await showConfirm({
      title: `Avisar a ${c.socio}`,
      message: `Se le enviará por WhatsApp el aviso de la factura ${c.numero || ''} (${fmtMoney(Number(c.pendingAmount ?? c.monto ?? 0))} pendientes).`,
      confirmLabel: 'Enviar aviso',
    }).catch(() => false)
    if (!ok) return
    setBusyId(c.id)
    try {
      const r = await fetch('/api/crm/members/batch', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: [c.memberId], action: 'send-payment-reminder' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || (j.failed ?? 0) > 0) {
        showAlert(j.errors?.[0]?.message || j.error || 'No se pudo enviar el aviso')
        return
      }
      showAlert(`Aviso reenviado a ${c.socio}.`)
    } finally { setBusyId('') }
  }

  async function reprogramar(c) {
    if (!reprogramDate) { showAlert('Elige la nueva fecha de vencimiento.'); return }
    const ok = await showConfirm({
      title: `Aplazar el recibo de ${c.socio}`,
      message:
        `${c.numero || ''} vence el ${new Date(c.vencimiento).toLocaleDateString('es-ES')}
` +
        `Nueva fecha: ${new Date(reprogramDate).toLocaleDateString('es-ES')}

` +
        'Dejará de contar como vencido hasta esa fecha. Al socio no se le avisa: díselo tú.',
      confirmLabel: 'Aplazar',
    }).catch(() => false)
    if (!ok) return
    setBusyId(c.id)
    try {
      const r = await fetch(`/api/crm/invoices/${c.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: reprogramDate }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo reprogramar'); return }
      setReprogramId(''); setReprogramDate('')
      await Promise.all([reload(), cargarImpagos(impagosPage, buscarImpago.trim())])
    } finally { setBusyId('') }
  }

  return (
    <SectionShell
      title="Impagos"
      subtitle="Cobros vencidos pendientes: reprograma o reenvía el aviso"
      actions={
        sociosAfectados > 0 ? (
          <button type="button" disabled={bulkBusy} onClick={reenviarTodos}
            style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:8,border:'none',background:'var(--green)',color:'#fff',cursor:bulkBusy?'not-allowed':'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,opacity:bulkBusy?0.6:1}}>
            <Icon name="whatsapp" size={15}/>
            {bulkBusy ? 'Enviando…' : `Reenviar aviso a todos (${sociosAfectados})`}
          </button>
        ) : null
      }
    >
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:20}}>
        <KPICard label="Impagos" value={String(vencidasClub)} sub={`${sociosAfectados} socio${sociosAfectados === 1 ? '' : 's'} con deuda`} icon="billing" color={vencidasClub > 0 ? 'var(--red)' : 'var(--green)'} badge={vencidasClub > 0 ? { kind:'danger', text:'Revisar' } : null}/>
        <KPICard label="Importe vencido" value={fmtMoney(totalVencido)} sub="Pendiente de cobrar" icon="billing" color="var(--amber)"/>
        <KPICard label="Socios afectados" value={String(sociosAfectados)} sub="Con al menos un impago" icon="users" color="var(--accent-soft)"/>
        <KPICard label="Antigüedad media" value={sociosAfectados ? `${antiguedadMedia} días` : '—'} sub="Desde el vencimiento" icon="calendar" color={antiguedadMedia > 60 ? 'var(--red)' : 'var(--amber)'}/>
      </div>

      {/* Dashboard de impagos: deuda por antigüedad + top morosos */}
      {sociosAfectados > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'minmax(0, 2fr) minmax(0, 1fr)',gap:24,alignItems:'start'}}>
          <div style={{background:'var(--surface-card)',borderRadius:12,padding:32,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
            <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Deuda por antigüedad</div>
            <div style={{fontSize:14,color:'var(--text-secondary)',margin:'4px 0 20px'}}>Importe vencido según los días desde el vencimiento</div>
            <BarChart data={agingAmounts} labels={AGING.map((b) => b.label)} color="#be123c" height={190} serieLabel="Importe vencido"/>
          </div>
          <div style={{background:'var(--surface-card)',borderRadius:12,padding:32,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
            <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Mayores deudores</div>
            <div style={{fontSize:14,color:'var(--text-secondary)',margin:'4px 0 18px'}}>Top {topMorosos.length} por importe vencido</div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {topMorosos.map((m) => (
                <div key={m.id}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8,marginBottom:6}}>
                    <span style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.nombre}</span>
                    <span style={{fontSize:13,fontWeight:700,color:'var(--red)',flexShrink:0}}>{fmtMoney(m.total)}</span>
                  </div>
                  <div style={{height:8,background:'var(--surface-low)',borderRadius:999,overflow:'hidden'}}>
                    <div style={{width:`${Math.max(Math.round((m.total / maxMorosoTotal) * 100), 4)}%`,height:'100%',background:'#be123c',borderRadius:999,opacity:0.85}}/>
                  </div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>{m.facturas} factura{m.facturas === 1 ? '' : 's'} vencida{m.facturas === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)',overflow:'hidden'}}>
        {(sociosAfectados > 0 || buscarImpago) && (
          <div style={{padding:'14px 24px 0'}}>
            <input
              type="search"
              value={buscarImpago}
              onChange={(e) => setBuscarImpago(e.target.value)}
              placeholder="Buscar socio, concepto o nº de factura…"
              aria-label="Buscar entre los impagos"
              style={{width:'100%',maxWidth:340,padding:'8px 14px',borderRadius:999,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'var(--text-primary)',background:'var(--surface-card)'}}
            />
          </div>
        )}
        {impagosLoading && impagos.length === 0 ? (
          <div style={{padding:'40px 32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>
            Cargando los impagos…
          </div>
        ) : impagosError ? (
          <div style={{padding:'40px 32px',textAlign:'center',fontSize:14}}>
            <div style={{color:'var(--red)',fontWeight:600,marginBottom:10}}>{impagosError}</div>
            <button type="button" onClick={() => { void cargarImpagos(impagosPage, buscarImpago.trim()) }}
              style={{padding:'8px 16px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700}}>
              Reintentar
            </button>
          </div>
        ) : impagos.length === 0 ? (
          <div style={{padding:'40px 32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>
            {buscarImpago.trim()
              ? `Ningún impago coincide con «${buscarImpago.trim()}».`
              : 'No hay cobros vencidos. Todo al día. 🎉'}
          </div>
        ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',minWidth:640,borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'var(--surface-low)'}}>
                  {['Socio','Recibo más antiguo','Debe','Vencido desde',''].map((h) => (
                    <th key={h} style={{padding:'12px 24px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {impagos.map((c) => (
                  <tr key={c.id} style={{borderTop:'1px solid var(--border)'}}>
                    <td style={{padding:'14px 24px',fontSize:14,fontWeight:600,color:'var(--text-primary)'}}>
                      <div>{c.socio}</div>
                      {c.telefono ? (
                        <a href={`tel:${c.telefono}`} style={{fontSize:12,color:'var(--accent)',textDecoration:'none',fontWeight:500}}>
                          {c.telefono}{c.esTelefonoTutor ? ' (tutor)' : ''}
                        </a>
                      ) : (
                        <div style={{fontSize:12,color:'var(--amber)'}}>Sin teléfono: no se le puede avisar</div>
                      )}
                    </td>
                    <td style={{padding:'14px 24px',fontSize:13,color:'var(--text-secondary)'}}>
                      <div style={{fontWeight:600,color:'var(--text-primary)'}}>{c.numero}</div>
                      <div>{c.concepto}</div>
                    </td>
                    <td style={{padding:'14px 24px',fontSize:14,fontWeight:700,color:'var(--red)'}}>
                      {fmtMoney(c.total)}
                      {c.recibos > 1 && (
                        <div style={{fontSize:11,fontWeight:500,color:'var(--text-muted)',marginTop:2}}>
                          {c.recibos} recibos
                        </div>
                      )}
                    </td>
                    <td style={{padding:'14px 24px',fontSize:13,color:'var(--text-secondary)'}}>
                      <div style={{fontWeight:600,color: c.diasVencida > 60 ? 'var(--red)' : 'var(--text-primary)'}}>
                        {c.diasVencida} días
                      </div>
                      <div style={{fontSize:12}}>{new Date(c.vencimiento).toLocaleDateString('es-ES')}</div>
                    </td>
                    <td style={{padding:'14px 24px',fontSize:13,color:'var(--text-secondary)'}}>{new Date(c.vencimiento).toLocaleDateString('es-ES')}</td>
                    <td style={{padding:'14px 24px'}}>
                      <div style={{display:'flex',gap:8,justifyContent:'flex-end',alignItems:'center',flexWrap:'wrap'}}>
                        {reprogramId === c.facturaId ? (
                          <>
                            <input type="date" min={new Date().toISOString().slice(0,10)} value={reprogramDate} onChange={(e) => setReprogramDate(e.target.value)}
                              style={{padding:'7px 10px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:12}}/>
                            <button type="button" disabled={busyId === c.facturaId} onClick={() => reprogramar({ ...c, id: c.facturaId })}
                              style={{padding:'7px 12px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700}}>
                              Guardar
                            </button>
                            <button type="button" onClick={() => { setReprogramId(''); setReprogramDate('') }}
                              style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-secondary)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" disabled={busyId === c.facturaId} onClick={() => setReprogramId(c.facturaId)}
                              style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-primary)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                              Reprogramar
                            </button>
                            <button type="button" disabled={busyId === c.facturaId || !c.telefono} onClick={() => reenviarAviso({ ...c, id: c.facturaId })}
                              style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--green-light)',color:'var(--green)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700}}>
                              {busyId === c.facturaId ? 'Enviando…' : c.recibos > 1 ? `Avisar de los ${c.recibos}` : 'Avisar'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {impagosData.totalPages > 1 && (
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'14px 24px',borderTop:'1px solid var(--border)'}}>
                <span style={{fontSize:13,color:'var(--text-muted)'}}>
                  Página {impagosData.page} de {impagosData.totalPages} · {impagosData.total} socios con deuda
                </span>
                <div style={{display:'flex',gap:8}}>
                  <button type="button" disabled={impagosPage <= 1 || impagosLoading}
                    onClick={() => setImpagosPage((p) => Math.max(1, p - 1))}
                    style={{padding:'7px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-primary)',cursor:impagosPage<=1?'not-allowed':'pointer',opacity:impagosPage<=1?0.5:1,fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                    Anterior
                  </button>
                  <button type="button" disabled={impagosPage >= impagosData.totalPages || impagosLoading}
                    onClick={() => setImpagosPage((p) => Math.min(impagosData.totalPages, p + 1))}
                    style={{padding:'7px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-primary)',cursor:impagosPage>=impagosData.totalPages?'not-allowed':'pointer',opacity:impagosPage>=impagosData.totalPages?0.5:1,fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionShell>
  )
}

// ── CONTABILIDAD · SUMARIO (roadmap · 6.1): solo consulta y exportación ─────
function ContabilidadSumario({ setActive }) {
  const { bundle, fmtMoney } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  const [rango, setRango] = useState('semestre') // 'semestre' | 'anual'
  // Saldo de caja y bancos. La cifra ya la calculaba el servidor, pero solo se
  // veía dentro de MAYOR detrás de «5720000 · ASSET»: la pregunta más habitual
  // del presidente («¿cómo vamos de dinero?») no tenía respuesta a la vista.
  const [tesoreria, setTesoreria] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/crm/accounting/reports', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo || !j) return
        const filas = Array.isArray(j.trialBalance) ? j.trialBalance : []
        // 57xx = caja y bancos, 56xx = depósitos y fianzas a corto plazo.
        const saldo = filas
          .filter((f) => /^5[67]/.test(String(f.code || '')))
          .reduce((a, f) => a + (Number(f.debit || 0) - Number(f.credit || 0)), 0)
        setTesoreria(saldo)
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  if (!(role === 'ADMIN' || role === 'TREASURER')) return null

  const kp = bundle?.kpis
  const ingresosMensual = bundle?.ingresosMensual ?? Array(12).fill(0)
  const egresoMensual = bundle?.egresoMensual ?? Array(12).fill(0)
  const conceptos = bundle?.ingresosPorConcepto ?? []
  const now = new Date()
  const mesActual = now.getMonth()

  const totalIngresos = ingresosMensual.reduce((a, b) => a + b, 0)
  const totalGastos = egresoMensual.reduce((a, b) => a + b, 0)
  const balanceAno = totalIngresos - totalGastos
  const gastosMes = egresoMensual[mesActual] ?? 0

  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const mesLabelsSemestre = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const raw = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  })
  const sliceSemestre = (arr) => {
    // Últimos 6 meses reales (con envoltura de año)
    return Array.from({ length: 6 }, (_, i) => {
      const idx = (mesActual - (5 - i) + 12) % 12
      return arr[idx] ?? 0
    })
  }
  const dataIngresos = rango === 'semestre' ? sliceSemestre(ingresosMensual) : ingresosMensual
  const dataGastos = rango === 'semestre' ? sliceSemestre(egresoMensual) : egresoMensual
  const labels = rango === 'semestre' ? mesLabelsSemestre : MESES

  /** Exporta los movimientos del año (bundle.reportTransactions) a CSV en cliente. */
  function exportarMovimientosCsv() {
    const rows = Array.isArray(bundle?.reportTransactions) ? bundle.reportTransactions : []
    const esc = (v) => {
      let s = String(v ?? '')
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
      return `"${s.replaceAll('"', '""')}"`
    }
    // «concepto» exportaba el TIPO de factura (MEMBERSHIP / OTHER / vacío), no el
    // concepto real: el CSV salía sin poder saber de qué era cada movimiento.
    const ORIGEN = {
      MANUAL: 'Registrado a mano',
      CASH: 'Efectivo',
      BANK_TRANSFER: 'Transferencia',
      BANK_CSV_IMPORT: 'Extracto bancario',
      INVOICE_PAYMENT: 'Cobro de factura',
      WHOP: 'Cobro online',
      STRIPE: 'Cobro online',
    }
    const lines = [
      ['Fecha', 'Tipo', 'Origen', 'Concepto', 'Importe'].join(';'),
      ...rows.map((t) => [
        t.date ? new Date(t.date).toLocaleDateString('es-ES') : '',
        t.type === 'INCOME' ? 'Ingreso' : 'Gasto',
        ORIGEN[t.source] || t.source || '',
        t.description || '',
        String(Number(t.amount || 0).toFixed(2)).replace('.', ','),
      ].map(esc).join(';')),
    ]
    const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `movimientos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <SectionShell
      title="Sumario"
      subtitle="Dashboard financiero de solo consulta: aquí no se edita, solo se exporta"
      actions={
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <button type="button" onClick={() => { window.location.href = '/api/billing/reports/invoices-csv' }}
            style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-primary)',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700}}>
            <Icon name="export" size={15}/>Exportar facturas (CSV)
          </button>
          <button type="button" onClick={exportarMovimientosCsv}
            style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700}}>
            <Icon name="export" size={15}/>Exportar movimientos (CSV)
          </button>
        </div>
      }
    >
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:20}}>
        <KPICard
          label="Dinero disponible hoy"
          value={tesoreria === null ? '—' : fmtMoney(tesoreria)}
          sub="Lo que hay en caja y en el banco"
          icon="billing"
          color="var(--green)"
        />
        <KPICard
          label={`Resultado de ${new Date().getFullYear()}`}
          value={fmtMoney(balanceAno)}
          sub="Ingresos − gastos registrados"
          icon="billing"
          color="var(--accent-soft)"
          badge={balanceAno >= 0 ? { kind:'success', text:'En positivo', icon:'trend_up' } : { kind:'danger', text:'En negativo', icon:'trend_down' }}
        />
        <KPICard label="Ingresos (mes)" value={fmtMoney(kp?.ingresosMes ?? 0)} sub="Ingresos registrados este mes" icon="reports" color="var(--green)"/>
        <KPICard label="Gastos (mes)" value={fmtMoney(gastosMes)} sub="Gastos registrados este mes" icon="billing" color="var(--red)"/>
        <KPICard
          label="Nos deben"
          value={fmtMoney(kp?.cobrosPendientesMonto ?? 0)}
          sub={
            (kp?.facturasVencidas ?? 0) > 0
              ? `De los cuales ${fmtMoney(kp?.deudaVencidaMonto ?? 0)} ya vencidos`
              : 'Ninguna factura vencida'
          }
          icon="billing"
          color="var(--amber)"
          badge={(kp?.facturasVencidas ?? 0) > 0 ? { kind:'warning', text:'Revisar en Impagos' } : null}
        />
      </div>

      <div style={{display:'grid',gridTemplateColumns:'minmax(0, 2fr) minmax(0, 1fr)',gap:24,alignItems:'start'}}>
        <div style={{background:'var(--surface-card)',borderRadius:12,padding:32,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,gap:12,flexWrap:'wrap'}}>
            <div>
              <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Evolución de Tesorería</div>
              <div style={{fontSize:14,color:'var(--text-secondary)',marginTop:4}}>Ingresos vs gastos ({rango === 'semestre' ? 'últimos 6 meses' : 'año completo'})</div>
            </div>
            <div style={{display:'flex',gap:4,background:'var(--surface-low)',borderRadius:999,padding:4}}>
              {['semestre','anual'].map((r) => (
                <button key={r} type="button" onClick={() => setRango(r)}
                  style={{padding:'6px 14px',fontSize:12,fontWeight:700,borderRadius:999,border:'none',cursor:'pointer',fontFamily:'inherit',
                    background:rango === r ? 'var(--surface-card)' : 'transparent',
                    color:rango === r ? 'var(--accent)' : 'var(--text-muted)'}}>
                  {r === 'semestre' ? 'Semestre' : 'Anual'}
                </button>
              ))}
            </div>
          </div>
          <BarChart data={dataIngresos} secondaryData={dataGastos} labels={labels} color="var(--accent-soft)" secondaryColor="#be123c" height={230}/>
          <div style={{display:'flex',gap:16,marginTop:12,justifyContent:'center'}}>
            <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text-secondary)'}}><span style={{width:10,height:10,borderRadius:3,background:'var(--accent-soft)'}}></span>Ingresos</span>
            <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text-secondary)'}}><span style={{width:10,height:10,borderRadius:3,background:'#be123c'}}></span>Gastos</span>
          </div>
        </div>

        <div style={{background:'var(--surface-card)',borderRadius:12,padding:32,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Ingresos por concepto</div>
          <div style={{fontSize:14,color:'var(--text-secondary)',margin:'4px 0 20px'}}>Distribución del año</div>
          <div style={{display:'flex',justifyContent:'center',marginBottom:20}}>
            <DonutChart size={150}
              segments={conceptos.length
                ? conceptos.map((c) => ({ label: c.label, value: Math.max(c.value, 0.01), color: c.color }))
                : [{ label: '—', value: 1, color: '#ebe3d8' }]}/>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {conceptos.map((c) => (
              <div key={c.label} style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{width:10,height:10,borderRadius:'50%',background:c.color,flexShrink:0}}></span>
                <span style={{fontSize:13,color:'var(--text-primary)',flex:1}}>{c.label}</span>
                <span style={{fontSize:13,fontWeight:600,color:'var(--text-secondary)'}}>{fmtMoney(c.value)}</span>
              </div>
            ))}
            {conceptos.length === 0 && <span style={{fontSize:13,color:'var(--text-muted)'}}>Aún no hay ingresos registrados.</span>}
          </div>
        </div>
      </div>

      <div style={{
        background:'var(--surface-low)',border:'1px solid var(--border)',borderRadius:12,
        padding:'14px 20px',fontSize:13,color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'
      }}>
        <span style={{fontWeight:700,color:'var(--text-primary)'}}>Solo lectura.</span>
        La gestión (crear facturas, ingresos y gastos, marcar pagos, impuestos) está en
        <button type="button" onClick={() => setActive('facturas')}
          style={{border:'none',background:'transparent',color:'var(--accent)',fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:13,padding:0}}>
          Contabilidad → Facturas →
        </button>
      </div>
    </SectionShell>
  )
}

// ── CONFIGURACIÓN · FORMS (constructor de formularios) ─────────────────────
function FormsConfigSection() {
  const { bundle, reload, showAlert } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  const [fields, setFields] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/crm/club-settings', { credentials: 'include', cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (!cancelled) setFields(j.registrationFieldsConfig || [])
      } catch { /* noop */ }
    })()
    return () => { cancelled = true }
  }, [])

  if (role !== 'ADMIN') return null

  async function guardar() {
    setSaving(true)
    try {
      const r = await fetch('/api/crm/club-settings', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationFieldsConfig: fields }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo guardar'); return }
      showAlert('Formulario guardado correctamente.')
      await reload()
    } finally { setSaving(false) }
  }

  return (
    <SectionShell
      title="Forms"
      subtitle="Constructor de formularios: define los campos del registro de socios (base para asistencia y contactos)"
      actions={
        <button type="button" disabled={saving || !fields} onClick={guardar}
          style={{padding:'10px 18px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,opacity:saving?0.6:1}}>
          {saving ? 'Guardando…' : 'Guardar formulario'}
        </button>
      }
    >
      <div style={{background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)',padding:24}}>
        {fields === null ? (
          <p style={{fontSize:13,color:'var(--text-muted)'}}>Cargando formulario…</p>
        ) : (
          <RegistrationFieldsTab fields={fields} onChange={setFields}/>
        )}
      </div>
    </SectionShell>
  )
}

// ── CONFIGURACIÓN · API ─────────────────────────────────────────────────────
function ApiInfoSection() {
  const { bundle } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  // Estado en vivo de la protección: si el índice responde 401, la clave está activa.
  const [apiStatus, setApiStatus] = useState('checking') // 'open' | 'protected' | 'checking' | 'error'
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/public/v1', { cache: 'no-store' })
        if (cancelled) return
        setApiStatus(r.status === 401 ? 'protected' : r.ok ? 'open' : 'error')
      } catch {
        if (!cancelled) setApiStatus('error')
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (role !== 'ADMIN') return null
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const endpoints = [
    ['GET', '/api/public/v1', 'Índice y documentación de la API'],
    ['GET', '/api/public/v1/teams', 'Equipos y horarios fijos'],
    ['GET', '/api/public/v1/events', 'Actividades (entrenamientos, partidos…)'],
    ['GET', '/api/public/v1/calendar', 'Resumen: eventos, festivos, equipos y horarios'],
    ['GET', '/api/public/v1/news', 'Noticias publicadas'],
    ['POST', '/api/public/v1/query', 'Endpoint único para bots (JSON)'],
  ]
  const STATUS_META = {
    checking: { text: 'Comprobando…', bg: 'var(--surface-low)', color: 'var(--text-muted)' },
    protected: { text: 'Protegida con API key', bg: 'var(--green-light)', color: 'var(--green)' },
    open: { text: 'Abierta (sin API key configurada)', bg: 'var(--amber-light)', color: 'var(--amber)' },
    error: { text: 'No se pudo comprobar', bg: 'var(--red-light)', color: 'var(--red)' },
  }
  const st = STATUS_META[apiStatus] || STATUS_META.checking
  return (
    <SectionShell
      title="API"
      subtitle="Integraciones externas: API pública deportiva de solo lectura"
      actions={
        <span style={{padding:'8px 16px',borderRadius:999,fontSize:12,fontWeight:700,background:st.bg,color:st.color}}>
          {st.text}
        </span>
      }>
      <div style={{background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)',padding:24,display:'flex',flexDirection:'column',gap:16}}>
        <p style={{margin:0,fontSize:14,color:'var(--text-secondary)',lineHeight:1.6}}>
          La API pública expone datos deportivos (equipos, horarios, actividades y noticias) sin datos personales
          ni de facturación. Si defines <code style={{background:'var(--surface-low)',padding:'2px 6px',borderRadius:6,fontSize:12}}>PUBLIC_SPORTS_API_KEY</code> en
          el servidor, exige <code style={{background:'var(--surface-low)',padding:'2px 6px',borderRadius:6,fontSize:12}}>Authorization: Bearer</code> o el header <code style={{background:'var(--surface-low)',padding:'2px 6px',borderRadius:6,fontSize:12}}>X-API-Key</code>.
        </p>
        <div style={{border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
          {endpoints.map(([method, path, desc], i) => (
            <div key={path} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderTop:i === 0 ? 'none' : '1px solid var(--border)',flexWrap:'wrap'}}>
              <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:999,background:method === 'GET' ? 'var(--green-light)' : 'var(--accent-pill)',color:method === 'GET' ? 'var(--green)' : 'var(--accent)',flexShrink:0}}>{method}</span>
              <code style={{fontSize:13,color:'var(--text-primary)',fontWeight:600}}>{base}{path}</code>
              <span style={{fontSize:12,color:'var(--text-muted)',flex:1,minWidth:160}}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  )
}

// ── PLACEHOLDERS DEL ROADMAP (módulos con dependencias pendientes) ─────────
/** Contactos (roadmap · 5.3): la vista de Socios + data de formularios + pop-up en lote. */
function ContactosSection() {
  return <Socios contactosMode/>
}

// ── ADMIN · ASISTENCIA (roadmap · 5.4): registro por grupo y fecha ──────────
function AsistenciaSection() {
  const { bundle, showAlert } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  const [data, setData] = useState(null)
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [expandedId, setExpandedId] = useState('')
  const [linkBusyId, setLinkBusyId] = useState('')

  const loadSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams({ from, to })
      const r = await fetch(`/api/crm/attendance/summary?${params.toString()}`, { credentials: 'include', cache: 'no-store' })
      if (!r.ok) return
      setData(await r.json())
    } catch { /* noop */ }
  }, [from, to])

  useEffect(() => { void loadSummary() }, [loadSummary])

  if (!(role === 'ADMIN' || role === 'COACH')) return null

  async function generarEnlace(session) {
    setLinkBusyId(session.eventId)
    try {
      const r = await fetch(`/api/crm/events/${session.eventId}/attendance-link`, { method: 'POST', credentials: 'include' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudieron enviar los enlaces'); return }
      track('enviar-enlaces-asistencia', { enviados: j.sent, total: j.total })
      showAlert(
        `${j.group}: ${j.sent}/${j.total} enlaces de asistencia enviados` +
        `${j.toGuardians ? ` (${j.toGuardians} a familiares)` : ''}.` +
        `${j.warning ? `\n${j.warning}` : ''}`,
      )
    } finally { setLinkBusyId('') }
  }

  const ATT_STATUS = {
    PRESENT: { label: 'Presente', bg: 'var(--green-light)', color: 'var(--green)' },
    LATE: { label: 'Tarde', bg: 'var(--amber-light)', color: 'var(--amber)' },
    ABSENT: { label: 'Ausente', bg: 'var(--red-light)', color: 'var(--red)' },
    PENDING: { label: 'Sin marcar', bg: 'var(--surface-low)', color: 'var(--text-muted)' },
  }
  const kpis = data?.kpis
  const sessions = data?.sessions ?? []

  return (
    <SectionShell
      title="Asistencia"
      subtitle="Quién vino a cada sesión: recuento y detalle por grupo y fecha"
      actions={
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            style={{padding:'8px 11px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,background:'var(--surface-card)'}}/>
          <span style={{fontSize:13,color:'var(--text-muted)'}}>→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            style={{padding:'8px 11px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,background:'var(--surface-card)'}}/>
        </div>
      }
    >
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:20}}>
        <KPICard label="Sesiones" value={String(kpis?.sessions ?? '—')} sub="Con pase de lista en el periodo" icon="calendar" color="var(--accent-soft)"/>
        <KPICard label="Asistencia media" value={kpis?.avgRate != null ? `${kpis.avgRate}%` : '—'} sub="Presentes + tarde sobre marcados" icon="reports" color="var(--green)"/>
        <KPICard label="Presencias" value={String(kpis?.presents ?? '—')} sub="Presentes y tarde" icon="users" color="var(--green)"/>
        <KPICard label="Ausencias" value={String(kpis?.absents ?? '—')} sub="En el periodo" icon="users" color={kpis?.absents ? 'var(--red)' : 'var(--green)'}/>
      </div>

      <div style={{background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)',overflow:'hidden'}}>
        {sessions.length === 0 ? (
          <div style={{padding:'40px 32px',textAlign:'center',color:'var(--text-muted)',fontSize:14,lineHeight:1.6}}>
            No hay sesiones con asistencia en este periodo.<br/>
            Crea un evento en el Calendario con «Programar formulario de asistencia».
          </div>
        ) : (
          sessions.map((s, i) => {
            const open = expandedId === s.eventId
            const d = new Date(s.date)
            return (
              <div key={s.eventId} style={{borderTop:i === 0 ? 'none' : '1px solid var(--border)'}}>
                <button type="button" onClick={() => setExpandedId(open ? '' : s.eventId)}
                  style={{display:'flex',alignItems:'center',gap:14,width:'100%',padding:'14px 24px',border:'none',background:open ? 'var(--surface-low)' : 'transparent',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                  <div style={{width:46,height:46,flexShrink:0,background:'var(--accent-pill)',borderRadius:10,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                    <span style={{fontSize:15,fontWeight:700,color:'var(--accent)',lineHeight:1}}>{d.getDate()}</span>
                    <span style={{fontSize:9,fontWeight:700,color:'var(--accent)',marginTop:2,letterSpacing:'0.04em'}}>{d.toLocaleString('es', { month: 'short' }).replace('.','').toUpperCase()}</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.title}</div>
                    <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{s.group?.name || 'Club'} · {s.marked}/{s.total} marcados</div>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end'}}>
                    <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:999,background:'var(--green-light)',color:'var(--green)'}}>{s.counts.present} P</span>
                    {s.counts.late > 0 && <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:999,background:'var(--amber-light)',color:'var(--amber)'}}>{s.counts.late} T</span>}
                    <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:999,background:'var(--red-light)',color:'var(--red)'}}>{s.counts.absent} A</span>
                    {s.rate !== null ? (
                      <span style={{fontSize:12,fontWeight:700,color:'var(--text-primary)',minWidth:44,textAlign:'right'}}>{s.rate}%</span>
                    ) : (
                      <span style={{fontSize:11,fontWeight:600,color:'var(--text-muted)'}}>Sin pasar lista</span>
                    )}
                    <span style={{display:'inline-flex',transform:open ? 'rotate(90deg)' : 'none',transition:'transform 0.15s',opacity:0.5}}>
                      <Icon name="chevron" size={14}/>
                    </span>
                  </div>
                </button>
                {open && (
                  <div style={{padding:'4px 24px 18px',background:'var(--surface-low)'}}>
                    <div style={{display:'flex',justifyContent:'flex-end',padding:'6px 0 10px'}}>
                      <button type="button" disabled={linkBusyId === s.eventId} onClick={() => generarEnlace(s)}
                        style={{padding:'7px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700}}>
                        {linkBusyId === s.eventId ? 'Enviando…' : 'Enviar formulario a los miembros'}
                      </button>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))',gap:8}}>
                      {s.detail.map((a, idx) => {
                        const st = ATT_STATUS[a.status] || ATT_STATUS.PENDING
                        return (
                          <div key={idx} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,padding:'8px 12px',background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:10}}>
                            <span style={{fontSize:13,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={a.reason || undefined}>{a.name}</span>
                            <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:999,background:st.bg,color:st.color,flexShrink:0}}>{st.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </SectionShell>
  )
}

// ── CONTABILIDAD · PRODUCTOS (roadmap · 6.4): cobros más allá de la cuota ────
function ProductosSection() {
  const { bundle, fmtMoney, showAlert, showConfirm } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  const [products, setProducts] = useState([])
  const [form, setForm] = useState({ name: '', type: 'ONE_TIME', billingPeriod: 'MONTHLY', price: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [rowBusyId, setRowBusyId] = useState('')

  const [cargando, setCargando] = useState(true)
  const [cargaError, setCargaError] = useState('')

  const loadProducts = useCallback(async () => {
    setCargaError('')
    try {
      const r = await fetch('/api/crm/products', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) {
        // Sin esto, un fallo de red dejaba la lista vacía y la pantalla decía
        // "aún no hay productos": el club creía haber perdido su catálogo.
        setCargaError('No se pudo cargar el catálogo. Comprueba tu conexión y vuelve a intentarlo.')
        return
      }
      const j = await r.json()
      setProducts(Array.isArray(j.products) ? j.products : [])
    } catch {
      setCargaError('No se pudo cargar el catálogo. Comprueba tu conexión y vuelve a intentarlo.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void loadProducts() }, [loadProducts])

  if (!(role === 'ADMIN' || role === 'TREASURER')) return null

  const TYPE_META = {
    ONE_TIME: { label: 'Pago único', bg: 'var(--accent-pill)', color: 'var(--accent)' },
    SUBSCRIPTION: { label: 'Suscripción', bg: 'var(--green-soft)', color: 'var(--green)' },
  }
  const PERIOD_LABEL = { MONTHLY: 'mensual', QUARTERLY: 'trimestral', YEARLY: 'anual' }

  async function crearProducto(e) {
    e.preventDefault()
    const name = form.name.trim()
    const price = Number(form.price)
    if (!name) { showAlert('Pon un nombre al producto.'); return }
    if (!Number.isFinite(price) || price < 0) { showAlert('Indica un precio válido.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/crm/products', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type: form.type,
          price,
          description: form.description.trim() || undefined,
          ...(form.type === 'SUBSCRIPTION' ? { billingPeriod: form.billingPeriod } : {}),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo crear el producto'); return }
      track('crear-producto', { tipo: form.type })
      if (form.type === 'SUBSCRIPTION') {
        showAlert('Producto de suscripción creado. Ya aparece como plan en Contabilidad → Suscripciones: asígnalo a un socio o grupo y el cobro se emitirá de forma recurrente.')
      }
      setForm({ name: '', type: 'ONE_TIME', billingPeriod: 'MONTHLY', price: '', description: '' })
      await loadProducts()
    } finally { setBusy(false) }
  }

  async function toggleActivo(p) {
    // Desactivar un producto de suscripción NO detiene los cobros de quien ya lo
    // tiene: solo impide asignarlo a socios nuevos. Sin decirlo, el club cree que
    // ha dejado de cobrar y sigue facturando cada mes.
    if (p.isActive && p.type === 'SUBSCRIPTION') {
      const ok = await showConfirm({
        title: `Desactivar «${p.name}»`,
        message:
          'Dejará de poder asignarse a socios nuevos, pero los socios que ya lo tienen ' +
          'SEGUIRÁN recibiendo su factura cada periodo.\n\n' +
          'Para dejar de cobrarles, da de baja su cuota en Contabilidad → Suscripciones.',
        confirmLabel: 'Desactivar',
        cancelLabel: 'Volver',
      }).catch(() => false)
      if (!ok) return
    }
    setRowBusyId(p.id)
    try {
      const r = await fetch(`/api/crm/products/${p.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !p.isActive }),
      })
      if (!r.ok) { showAlert('No se pudo actualizar'); return }
      await loadProducts()
    } finally { setRowBusyId('') }
  }

  const inputSt = { padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'inherit', fontSize:14, boxSizing:'border-box' }

  return (
    <SectionShell
      title="Productos"
      subtitle="Cobros más allá de la cuota: equipaciones, eventos y pagos únicos"
      actions={
        // La tienda completa exige ADMIN y la pantalla no lo comprueba: a un
        // tesorero le abría una página de error del servidor. Se le oculta.
        role === 'ADMIN' ? (
          <a href="/admin/store" style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-primary)',fontFamily:'inherit',fontSize:13,fontWeight:600,textDecoration:'none'}}>
            Tienda completa (stock, imágenes) →
          </a>
        ) : null
      }
    >
      {/* Pantalla de creación (nombre, tipo, precio) */}
      <form onSubmit={crearProducto} style={{background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)',padding:24}}>
        <div style={{fontWeight:700,fontSize:15,color:'var(--text-primary)',marginBottom:14}}>Crear producto</div>
        <div style={{display:'grid',gridTemplateColumns:form.type === 'SUBSCRIPTION' ? '2fr 1.2fr 1.2fr 1fr auto' : '2fr 1.4fr 1fr auto',gap:10,alignItems:'end'}}>
          <div>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>Nombre *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej. Equipación 2026" style={{...inputSt, width:'100%'}}/>
          </div>
          <div>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>Tipo *</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              style={{...inputSt, width:'100%', background:'#fff', cursor:'pointer'}}>
              <option value="ONE_TIME">Pago único</option>
              <option value="SUBSCRIPTION">Suscripción (pago recurrente)</option>
            </select>
          </div>
          {form.type === 'SUBSCRIPTION' && (
            <div>
              <label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>Se cobra *</label>
              <select value={form.billingPeriod} onChange={(e) => setForm((f) => ({ ...f, billingPeriod: e.target.value }))}
                style={{...inputSt, width:'100%', background:'#fff', cursor:'pointer'}}>
                <option value="MONTHLY">Cada mes</option>
                <option value="QUARTERLY">Cada trimestre</option>
                <option value="YEARLY">Cada año</option>
              </select>
            </div>
          )}
          <div>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>Precio (€) *</label>
            <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              placeholder="0.00" style={{...inputSt, width:'100%'}}/>
          </div>
          <button type="submit" disabled={busy || !form.name.trim() || form.price === ''}
            style={{padding:'10px 20px',borderRadius:10,border:'none',background:'var(--accent)',color:'#fff',cursor:busy?'not-allowed':'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,opacity:busy||!form.name.trim()||form.price===''?0.6:1,height:41}}>
            {busy ? 'Creando…' : 'Crear producto'}
          </button>
        </div>
        {form.type === 'SUBSCRIPTION' && (
          <p style={{margin:'10px 0 0',fontSize:12,color:'var(--text-muted)'}}>
            El producto se crea también como plan en <strong>Contabilidad → Suscripciones</strong>: al asignarlo a un socio o grupo, la factura se emite de forma recurrente con la periodicidad elegida.
          </p>
        )}
        <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Descripción (opcional)…" style={{...inputSt, width:'100%', marginTop:10}}/>
      </form>

      {/* Listado */}
      <div style={{background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)',overflow:'hidden'}}>
        {cargando ? (
          <div style={{padding:'40px 32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>
            Cargando el catálogo…
          </div>
        ) : cargaError ? (
          <div style={{padding:'40px 32px',textAlign:'center',fontSize:14}}>
            <div style={{color:'var(--red)',fontWeight:600,marginBottom:10}}>{cargaError}</div>
            <button type="button" onClick={() => { setCargando(true); void loadProducts() }}
              style={{padding:'8px 16px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700}}>
              Reintentar
            </button>
          </div>
        ) : products.length === 0 ? (
          <div style={{padding:'40px 32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>
            Aún no hay productos. Crea el primero arriba.
          </div>
        ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',minWidth:640,borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'var(--surface-low)'}}>
                  {['Producto','Tipo','Precio','Ventas','Estado',''].map((h) => (
                    <th key={h} style={{padding:'12px 24px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const meta = TYPE_META[p.type] || TYPE_META.ONE_TIME
                  return (
                    <tr key={p.id} style={{borderTop:'1px solid var(--border)',opacity:p.isActive ? 1 : 0.55}}>
                      <td style={{padding:'14px 24px'}}>
                        <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)'}}>{p.name}</div>
                        {p.description && <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{p.description}</div>}
                      </td>
                      <td style={{padding:'14px 24px'}}>
                        <span style={{fontSize:11,fontWeight:700,padding:'4px 11px',borderRadius:999,background:meta.bg,color:meta.color,whiteSpace:'nowrap'}}>
                          {meta.label}{p.type === 'SUBSCRIPTION' && p.billingPeriod ? ` · ${PERIOD_LABEL[p.billingPeriod] || ''}` : ''}
                        </span>
                      </td>
                      <td style={{padding:'14px 24px',fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>
                        {fmtMoney(p.price)}
                        {p.type === 'SUBSCRIPTION' && p.billingPeriod ? <span style={{fontSize:11,fontWeight:500,color:'var(--text-muted)'}}> /{PERIOD_LABEL[p.billingPeriod] || ''}</span> : null}
                      </td>
                      <td style={{padding:'14px 24px',fontSize:13,color:'var(--text-secondary)'}}>{p.sales}</td>
                      <td style={{padding:'14px 24px'}}>
                        <span style={{fontSize:11,fontWeight:700,padding:'4px 11px',borderRadius:999,background:p.isActive ? 'var(--green-soft)' : 'var(--surface-low)',color:p.isActive ? 'var(--green)' : 'var(--text-muted)'}}>
                          {p.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{padding:'14px 24px'}}>
                        <div style={{display:'flex',justifyContent:'flex-end'}}>
                          <button type="button" disabled={rowBusyId === p.id} onClick={() => toggleActivo(p)}
                            style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:p.isActive ? 'var(--red)' : 'var(--green)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                            {rowBusyId === p.id ? '…' : p.isActive ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionShell>
  )
}

// ── CONTABILIDAD · DESCUENTOS (roadmap · 6.5): generador de códigos ─────────
function DescuentosSection() {
  const { bundle, fmtMoney, showAlert } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  const [discounts, setDiscounts] = useState([])
  const [form, setForm] = useState({ label: '', kind: 'PERCENT', value: '', code: '' })
  const [busy, setBusy] = useState(false)
  const [rowBusyId, setRowBusyId] = useState('')

  const [cargandoD, setCargandoD] = useState(true)
  const [cargaErrorD, setCargaErrorD] = useState('')

  const loadDiscounts = useCallback(async () => {
    setCargaErrorD('')
    try {
      const r = await fetch('/api/crm/discounts', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) {
        setCargaErrorD('No se pudieron cargar los descuentos. Comprueba tu conexión y vuelve a intentarlo.')
        return
      }
      const j = await r.json()
      setDiscounts(Array.isArray(j.discounts) ? j.discounts : [])
    } catch {
      setCargaErrorD('No se pudieron cargar los descuentos. Comprueba tu conexión y vuelve a intentarlo.')
    } finally {
      setCargandoD(false)
    }
  }, [])

  useEffect(() => { void loadDiscounts() }, [loadDiscounts])

  if (!(role === 'ADMIN' || role === 'TREASURER')) return null

  async function generarDescuento(e) {
    e.preventDefault()
    const label = form.label.trim()
    const value = Number(form.value)
    if (!label) { showAlert('Pon una etiqueta (ej. Hermanos, Familia numerosa).'); return }
    if (!Number.isFinite(value) || value <= 0) { showAlert('Indica un valor válido.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/crm/discounts', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, kind: form.kind, value, code: form.code.trim() || undefined }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo generar el código'); return }
      track('crear-descuento', { tipo: form.kind })
      setForm({ label: '', kind: 'PERCENT', value: '', code: '' })
      await loadDiscounts()
      showAlert(`Código generado: ${j.code}\nAplícalo al asignar una cuota en Suscripciones.`)
    } finally { setBusy(false) }
  }

  async function toggleActivo(d) {
    setRowBusyId(d.id)
    try {
      const r = await fetch(`/api/crm/discounts/${d.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !d.isActive }),
      })
      if (!r.ok) { showAlert('No se pudo actualizar'); return }
      await loadDiscounts()
    } finally { setRowBusyId('') }
  }

  const inputSt = { padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', fontFamily:'inherit', fontSize:14, boxSizing:'border-box' }

  return (
    <SectionShell
      title="Descuentos"
      subtitle="Genera códigos (hermanos, familia numerosa…) y aplícalos al asignar una cuota"
    >
      {/* Generador */}
      <form onSubmit={generarDescuento} style={{background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)',padding:24}}>
        <div style={{fontWeight:700,fontSize:15,color:'var(--text-primary)',marginBottom:14}}>Generar código de descuento</div>
        <div style={{display:'grid',gridTemplateColumns:'1.6fr 1.2fr 0.8fr 1.2fr auto',gap:10,alignItems:'end'}}>
          <div>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>Tipo de descuento *</label>
            <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Hermanos, Familia numerosa…" style={{...inputSt, width:'100%'}}/>
          </div>
          <div>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>Modalidad *</label>
            <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
              style={{...inputSt, width:'100%', background:'#fff', cursor:'pointer'}}>
              <option value="PERCENT">Porcentaje (%)</option>
              <option value="FIXED">Importe fijo (€)</option>
            </select>
          </div>
          <div>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>Valor *</label>
            <input type="number" min="0.01" step="0.01" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder={form.kind === 'PERCENT' ? '10' : '5.00'} style={{...inputSt, width:'100%'}}/>
          </div>
          <div>
            <label style={{display:'block',fontSize:12,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>Código (opcional)</label>
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="Se genera solo" style={{...inputSt, width:'100%', textTransform:'uppercase'}}/>
          </div>
          <button type="submit" disabled={busy || !form.label.trim() || form.value === ''}
            style={{padding:'10px 20px',borderRadius:10,border:'none',background:'var(--accent)',color:'#fff',cursor:busy?'not-allowed':'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,opacity:busy||!form.label.trim()||form.value===''?0.6:1,height:41,whiteSpace:'nowrap'}}>
            {busy ? 'Generando…' : 'Generar código'}
          </button>
        </div>
      </form>

      {/* Lista de códigos */}
      <div style={{background:'var(--surface-card)',borderRadius:12,border:'1px solid var(--border)',boxShadow:'var(--card-shadow)',overflow:'hidden'}}>
        {cargandoD ? (
          <div style={{padding:'40px 32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>
            Cargando los descuentos…
          </div>
        ) : cargaErrorD ? (
          <div style={{padding:'40px 32px',textAlign:'center',fontSize:14}}>
            <div style={{color:'var(--red)',fontWeight:600,marginBottom:10}}>{cargaErrorD}</div>
            <button type="button" onClick={() => { setCargandoD(true); void loadDiscounts() }}
              style={{padding:'8px 16px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700}}>
              Reintentar
            </button>
          </div>
        ) : discounts.length === 0 ? (
          <div style={{padding:'40px 32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>
            Aún no hay códigos. Genera el primero arriba.
          </div>
        ) : (
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
            <table style={{width:'100%',minWidth:640,borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'var(--surface-low)'}}>
                  {['Código','Tipo de descuento','Valor','En uso','Estado',''].map((h) => (
                    <th key={h} style={{padding:'12px 24px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {discounts.map((d) => (
                  <tr key={d.id} style={{borderTop:'1px solid var(--border)',opacity:d.isActive ? 1 : 0.55}}>
                    <td style={{padding:'14px 24px'}}>
                      <span style={{fontFamily:'ui-monospace, monospace',fontSize:13,fontWeight:700,padding:'4px 10px',borderRadius:8,background:'var(--surface-low)',color:'var(--text-primary)',letterSpacing:'0.04em'}}>{d.code}</span>
                    </td>
                    <td style={{padding:'14px 24px',fontSize:14,color:'var(--text-primary)',fontWeight:600}}>{d.label}</td>
                    <td style={{padding:'14px 24px',fontSize:14,fontWeight:700,color:'var(--green)'}}>
                      {d.kind === 'PERCENT' ? `−${d.value}%` : `−${fmtMoney(d.value)}`}
                    </td>
                    <td style={{padding:'14px 24px',fontSize:13,color:'var(--text-secondary)'}}>
                      {d.uses} suscripción{d.uses === 1 ? '' : 'es'}
                    </td>
                    <td style={{padding:'14px 24px'}}>
                      <span style={{fontSize:11,fontWeight:700,padding:'4px 11px',borderRadius:999,background:d.isActive ? 'var(--green-soft)' : 'var(--surface-low)',color:d.isActive ? 'var(--green)' : 'var(--text-muted)'}}>
                        {d.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{padding:'14px 24px'}}>
                      <div style={{display:'flex',justifyContent:'flex-end'}}>
                        <button type="button" disabled={rowBusyId === d.id} onClick={() => toggleActivo(d)}
                          style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:d.isActive ? 'var(--red)' : 'var(--green)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                          {rowBusyId === d.id ? '…' : d.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p style={{margin:0,fontSize:12,color:'var(--text-muted)'}}>
        El descuento se aplica en cada factura que emite la suscripción (línea de descuento visible en la factura).
        Desactivar un código no toca las suscripciones existentes, pero deja de descontar en las siguientes facturas.
      </p>
    </SectionShell>
  )
}

// ── SOCIOS ──────────────────────────────────────────────────────────────────
// contactosMode (roadmap · 5.3): misma tabla + ficha, añadiendo la data de los
// formularios de registro y las acciones en lote del pop-up de Contactos.
function Socios({ contactosMode = false }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { bundle, reload, fmtMoney, showAlert, showConfirm } = useCrm();
  const role = normalizeRole(bundle?.user?.role)
  if (role !== 'ADMIN') return null
  const [sociosDb, setSociosDb] = useState<any[]>([])
  const SOCIOS_UI = sociosDb
  const [sociosPage, setSociosPage] = useState(1)
  const sociosPageSize = 50
  const [sociosTotal, setSociosTotal] = useState(0)
  const [sociosTotalPages, setSociosTotalPages] = useState(1)
  const [sociosStats, setSociosStats] = useState({
    total: 0,
    activos: 0,
    morosos: 0,
    cuotaPromedio: 0,
  })
  const [deportes, setDeportes] = useState(['Todos'])
  const [sociosLoading, setSociosLoading] = useState(false)
  const [searchDebounced, setSearchDebounced] = useState('')
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
  // "Aplicar cuota" desde la ficha del socio: elige cuota y devuelve el enlace de pago.
  const [aplicarCuota, setAplicarCuota] = useState<{ id: string; nombre: string } | null>(null)
  const [aplicarCuotaPlanId, setAplicarCuotaPlanId] = useState('')
  const [aplicarCuotaPlanes, setAplicarCuotaPlanes] = useState<{ id: string; name: string; amount: number; billingPeriodLabel: string; paymentRequiredOnEnrollment: boolean }[]>([])
  const [aplicarCuotaBusy, setAplicarCuotaBusy] = useState(false)
  const [aplicarCuotaUrl, setAplicarCuotaUrl] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkMenu, setBulkMenu] = useState<{ top: number; left: number } | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkPlanModal, setBulkPlanModal] = useState(false)
  const [bulkPlanId, setBulkPlanId] = useState('')
  const [bulkPlanStartDate, setBulkPlanStartDate] = useState('')
  // Acciones del pop-up de Contactos (roadmap · 5.3)
  const [bulkMsgModal, setBulkMsgModal] = useState(false)
  const [bulkMsgText, setBulkMsgText] = useState('')
  const [bulkGroupModal, setBulkGroupModal] = useState(false)
  const [bulkGroupId, setBulkGroupId] = useState('')
  const [bulkGroupRole, setBulkGroupRole] = useState('PLAYER')
  const [gruposOptions, setGruposOptions] = useState([])

  async function cargarGruposOptions() {
    if (gruposOptions.length > 0) return
    try {
      const r = await fetch('/api/crm/groups', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      const out = []
      const walk = (nodes, depth) => {
        for (const n of nodes || []) {
          out.push({ id: n.id, name: n.name, depth })
          walk(n.children, depth + 1)
        }
      }
      walk(j.tree, 0)
      setGruposOptions(out)
      if (out[0]?.id) setBulkGroupId(out[0].id)
    } catch { /* noop */ }
  }

  /** Exportar la selección a CSV (descarga en cliente, sin backend). */
  function exportarSeleccionCsv() {
    const rows = SOCIOS_UI.filter((s) => selectedIds.has(s.id))
    if (rows.length === 0) return
    const esc = (v) => {
      let s = String(v ?? '')
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
      return `"${s.replaceAll('"', '""')}"`
    }
    const header = ['nombre', 'email', 'telefono', 'dni', 'domicilio', 'estado', 'cuota', 'vencimiento']
    const lines = [
      header.join(','),
      ...rows.map((s) => [s.nombre, s.email, s.telefono, s.dni, s.domicilio, s.estado, s.cuota, s.vencimiento].map(esc).join(',')),
    ]
    const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contactos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setBulkMenu(null)
  }
  const [showInscripcion, setShowInscripcion] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
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
  const [membershipPlans, setMembershipPlans] = useState([])
  const registrationFieldsConfig = Array.isArray(bundle?.club?.registrationFields)
    ? bundle.club.registrationFields
    : getDefaultRegistrationFields()
  const [registrationValues, setRegistrationValues] = useState(() =>
    emptyRegistrationValues(getDefaultRegistrationFields()),
  )
  const [formInscripcionAdmin, setFormInscripcionAdmin] = useState({
    fechaAlta: new Date().toISOString().slice(0, 10),
    planId: '',
    paymentRequiredOnEnrollment: false,
  });

  useEffect(() => {
    if (!selected) setShowEditSocioModal(false);
  }, [selected]);

  const loadSociosDb = useCallback(async () => {
    setSociosLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(sociosPage),
        pageSize: String(sociosPageSize),
        stats: '1',
      })
      if (searchDebounced.trim()) params.set('q', searchDebounced.trim())
      if (filterEstado !== 'Todos') params.set('estado', filterEstado)
      if (filterDeporte !== 'Todos') params.set('deporte', filterDeporte)
      if (teamFilterId) params.set('groupId', teamFilterId)
      const r = await fetch(`/api/crm/members?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!r.ok) throw new Error('No se pudo cargar la lista real de socios')
      const j = await r.json()
      setSociosDb(Array.isArray(j?.socios) ? j.socios : [])
      setSociosTotal(Number(j?.total || 0))
      setSociosTotalPages(Math.max(1, Number(j?.totalPages || 1)))
      if (j?.stats) {
        setSociosStats({
          total: Number(j.stats.total || 0),
          activos: Number(j.stats.activos || 0),
          morosos: Number(j.stats.morosos || 0),
          cuotaPromedio: Number(j.stats.cuotaPromedio || 0),
        })
      }
      if (Array.isArray(j?.deportes)) setDeportes(j.deportes)
    } finally {
      setSociosLoading(false)
    }
  }, [sociosPage, sociosPageSize, searchDebounced, filterEstado, filterDeporte, teamFilterId])

  const loadMembershipPlans = useCallback(async () => {
    const r = await fetch('/api/crm/membership-plans', { credentials: 'include', cache: 'no-store' })
    if (!r.ok) return []
    const j = await r.json()
    const active = (j.plans || []).filter((p) => p.isActive)
    setMembershipPlans(active)
    return active
  }, [])

  useEffect(() => {
    loadSociosDb().catch(() => {})
    loadMembershipPlans().catch(() => {})
  }, [loadSociosDb, loadMembershipPlans])

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setSociosPage(1)
  }, [searchDebounced, filterEstado, filterDeporte, teamFilterId])

  useEffect(() => {
    function closeMenu(e: MouseEvent) {
      const target = e.target
      if (!(target instanceof Element)) return
      if (!target.closest('[data-socio-menu]')) {
        setMenuSocioId(null)
        setBulkMenu(null)
      }
    }
    document.addEventListener('mousedown', closeMenu)
    return () => document.removeEventListener('mousedown', closeMenu)
  }, [])

  const filtered = SOCIOS_UI
  const estados = ['Todos', 'Activo', 'Moroso', 'Inactivo']

  function planPaymentRequiredDefault(planId) {
    return membershipPlans.find((p) => p.id === planId)?.paymentRequiredOnEnrollment ?? false
  }

  async function abrirFormularioInscripcion() {
    let plans = membershipPlans
    if (!plans.length) {
      plans = (await loadMembershipPlans()) || []
    }
    const defaultPlanId = plans[0]?.id || ''
    setRegistrationValues(emptyRegistrationValues(registrationFieldsConfig))
    setFormInscripcionAdmin({
      fechaAlta: new Date().toISOString().slice(0, 10),
      planId: defaultPlanId,
      paymentRequiredOnEnrollment: planPaymentRequiredDefault(defaultPlanId),
    });
    setShowInscripcion(true);
  }

  async function enviarInscripcion(e) {
    e.preventDefault();
    const fieldErrors = validateRegistrationSubmission(registrationValues, registrationFieldsConfig)
    const firstFieldError = Object.values(fieldErrors)[0]
    if (firstFieldError) {
      showAlert(firstFieldError);
      return;
    }
    if (membershipPlans.length > 1 && !formInscripcionAdmin.planId) {
      showAlert('Selecciona el plan de cuota para que el socio vea el pago en Mis pagos.');
      return;
    }
    if (membershipPlans.length > 0 && !formInscripcionAdmin.planId) {
      showAlert('No hay plan de cuota seleccionado. Crea un plan en Gestión de cuotas o selecciónalo en el formulario.');
      return;
    }
    setInscripcionBusy(true);
    try {
      const r = await fetch('/api/crm/members', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationValues,
          joinedAt: formInscripcionAdmin.fechaAlta || undefined,
          planId: formInscripcionAdmin.planId || undefined,
          paymentRequiredOnEnrollment: formInscripcionAdmin.paymentRequiredOnEnrollment,
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
      track('crear-socio', { conCuota: !!formInscripcionAdmin.planId })
      try {
        const j = await r.json()
        if (j?.memberAccount?.email) {
          const cuotaMsg = j.subscriptionId ? ' Cuota y factura generadas en Mis pagos.' : ''
          showAlert(`Socio creado. Acceso portal: ${j.memberAccount.email} / ${j.memberAccount.defaultPassword}.${cuotaMsg}`)
        } else if (j?.warning) {
          showAlert(j.warning)
        } else if (j?.subscriptionId) {
          showAlert('Socio creado con cuota asignada. Verá el pago en Mis pagos al entrar con su email.')
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

  const insLabel = { fontSize: 12, fontWeight: 600, color: '#a8a29e', marginBottom: 6, display: 'block', letterSpacing: 0.3 };
  const insInput = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    border: '1px solid #44403c',
    background: '#292524',
    color: '#f4efe8',
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

    let ok = false;
    try {
      ok = await showConfirm(`¿Guardar los cambios en el perfil de "${name}"?`);
    } catch {
      ok = typeof window !== 'undefined'
        ? window.confirm(`¿Guardar los cambios en el perfil de "${name}"?`)
        : true;
    }
    if (!ok) return;

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
      track('editar-socio')
      setShowEditSocioModal(false);
      showAlert(`Datos de "${name}" actualizados correctamente.`);
      await reload();
      await loadSociosDb()
      const detailR = await fetch(`/api/crm/members?id=${encodeURIComponent(savedId)}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (detailR.ok) {
        const detailJ = await detailR.json()
        if (detailJ?.socio) setSelected(detailJ.socio)
      }
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
    setBulkMenu(null)
  }

  function toggleSelectSocio(id: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllOnPage(e?: React.MouseEvent) {
    e?.stopPropagation()
    const pageIds = filtered.map((s) => s.id)
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }

  function openBulkMenu(e: React.MouseEvent, seedId?: string) {
    e.preventDefault()
    e.stopPropagation()
    setMenuSocioId(null)
    if (seedId && !selectedIds.has(seedId)) {
      setSelectedIds(new Set([seedId]))
    }
    const count = seedId && !selectedIds.has(seedId) ? 1 : selectedIds.size
    if (count === 0) return
    setBulkMenu({ top: e.clientY, left: e.clientX })
  }

  async function runBulkAction(
    action: 'delete' | 'reset-portal-access' | 'set-status' | 'send-payment-reminder' | 'assign-plan' | 'send-message' | 'add-to-group',
    extra?: {
      status?: string
      confirmMessage?: string
      planId?: string
      startDate?: string
      autoPay?: boolean
      paymentRequiredOnEnrollment?: boolean
      message?: string
      groupId?: string
      groupRole?: string
    },
  ) {
    setBulkMenu(null)
    const ids = [...selectedIds]
    if (ids.length === 0) return

    if (extra?.confirmMessage) {
      let ok = false
      try {
        ok = await showConfirm(extra.confirmMessage)
      } catch {
        ok = typeof window !== 'undefined' ? window.confirm(extra.confirmMessage) : true
      }
      if (!ok) return
    }

    setBulkBusy(true)
    try {
      const r = await fetch('/api/crm/members/batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberIds: ids,
          action,
          status: extra?.status,
          planId: extra?.planId,
          startDate: extra?.startDate,
          autoPay: extra?.autoPay,
          paymentRequiredOnEnrollment: extra?.paymentRequiredOnEnrollment,
          message: extra?.message,
          groupId: extra?.groupId,
          groupRole: extra?.groupRole,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudo completar la acción en lote')
        return
      }
      const errCount = Number(j.failed || 0)
      const okCount = Number(j.succeeded || 0)
      if (errCount > 0 && Array.isArray(j.errors) && j.errors.length > 0) {
        const sample = j.errors.slice(0, 3).map((e: { message: string }) => e.message).join(' · ')
        showAlert(`${okCount} correctos, ${errCount} fallidos. ${sample}`)
      } else {
        showAlert(`Acción completada en ${okCount} socio${okCount === 1 ? '' : 's'}.`)
      }
      setSelectedIds(new Set())
      if (selected && ids.includes(selected.id)) setSelected(null)
      await reload()
      await loadSociosDb()
    } finally {
      setBulkBusy(false)
    }
  }

  /** Abre el diálogo para aplicar una cuota a un socio concreto. */
  async function abrirAplicarCuota(socio: { id: string; nombre: string }) {
    setAplicarCuota({ id: socio.id, nombre: socio.nombre })
    setAplicarCuotaUrl('')
    try {
      const r = await fetch('/api/crm/membership-plans', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      const planes = (j.plans || []).filter((p: { isActive?: boolean }) => p.isActive !== false)
      setAplicarCuotaPlanes(planes)
      if (planes[0]?.id) setAplicarCuotaPlanId(planes[0].id)
    } catch {
      /* el diálogo avisa si no hay cuotas */
    }
  }

  /** Aplica la cuota elegida y devuelve el enlace de pago en el momento. */
  async function confirmarAplicarCuota() {
    if (!aplicarCuota || !aplicarCuotaPlanId || aplicarCuotaBusy) return
    setAplicarCuotaBusy(true)
    try {
      const plan = aplicarCuotaPlanes.find((p) => p.id === aplicarCuotaPlanId)
      const r = await fetch('/api/crm/whop/assign-plan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberIds: [aplicarCuota.id],
          planId: aplicarCuotaPlanId,
          paymentRequiredOnEnrollment: plan?.paymentRequiredOnEnrollment,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || 'No se pudo aplicar la cuota')
        return
      }
      track('aplicar-cuota-socio')
      await reload()
      if (j.url) {
        setAplicarCuotaUrl(String(j.url))
        try { await navigator.clipboard?.writeText(String(j.url)) } catch { /* se muestra igual */ }
      } else {
        setAplicarCuota(null)
        showAlert(
          j.linkError
            ? `Cuota aplicada, pero no se pudo generar el enlace de pago: ${j.linkError}`
            : 'Cuota aplicada correctamente.',
        )
      }
    } finally {
      setAplicarCuotaBusy(false)
    }
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
    color: '#1c1917',
    outline: 'none',
    boxSizing: 'border-box' as const,
  };
  const editLabel = {
    fontSize: 12,
    fontWeight: 600 as const,
    color: '#78716c',
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

  const totalSocios = sociosStats.total
  const sociosActivosN = sociosStats.activos
  const sociosMorososN = sociosStats.morosos
  const cuotaPromedio = sociosStats.cuotaPromedio

  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--surface)'}}>
      <div style={{maxWidth:1440,margin:'0 auto',padding:'32px 40px 56px',display:'flex',flexDirection:'column',gap:32}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:24,flexWrap:'wrap'}}>
          <div>
            <h1 style={{fontSize:28,fontWeight:700,color:'var(--text-primary)',letterSpacing:'-0.02em',margin:0,lineHeight:1.1}}>{contactosMode ? 'Contactos' : 'Socios'}</h1>
            <p style={{color:'var(--text-secondary)',fontSize:14,marginTop:6,margin:0}}>
              {teamFilterId && equipoFiltrado
                ? `${sociosTotal} socios en «${equipoFiltrado.nombre}»`
                : contactosMode
                  ? `${totalSocios.toLocaleString('es-ES')} contactos · con la información de los formularios`
                  : `${totalSocios.toLocaleString('es-ES')} socios registrados en el club`}
            </p>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',alignItems:'flex-start',gap:10}}>
            <InviteLinkButton />
            <PaymentReminderButton />
            <button
              type="button"
              onClick={() => setShowCsvImport(true)}
              style={{
                display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
                borderRadius:8,border:'1px solid var(--border)',cursor:'pointer',
                background:'var(--surface-card)',color:'var(--text-primary)',
                fontFamily:'inherit',fontSize:13,fontWeight:700,
                transition:'all 0.15s'
              }}
            >
              <Icon name="export" size={15}/>Importar CSV
            </button>
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
          />
          <KPICard
            label="Socios activos"
            value={String(sociosActivosN)}
            sub={`${totalSocios > 0 ? Math.round((sociosActivosN / totalSocios) * 100) : 0}% del total`}
            icon="users"
            color="var(--green)"
          />
          <KPICard
            label="Morosos"
            value={String(sociosMorososN)}
            sub={sociosMorososN > 0 ? 'Requieren cobro' : 'Sin morosidad'}
            icon="billing"
            color={sociosMorososN > 0 ? 'var(--red)' : 'var(--green)'}
            badge={sociosMorososN > 0 ? { kind:'danger', text:'Atención' } : null}
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
                outline:'revert',color:'var(--text-primary)'
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
          <span style={{ fontSize: 14, color: '#44403c', fontWeight: 500 }}>
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
              background: '#1c1917',
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
      <div
        data-socio-menu
        style={{background:'var(--surface-card)',borderRadius:12,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',overflow:'visible',position:'relative'}}
        onContextMenu={(e) => openBulkMenu(e)}
      >
        <div style={{padding:'24px 32px',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Directorio de socios</div>
          <div style={{fontSize:13,color:'var(--text-muted)',marginTop:4}}>
            {sociosLoading
              ? 'Cargando socios…'
              : `${sociosTotal.toLocaleString('es-ES')} ${sociosTotal === 1 ? 'resultado' : 'resultados'} · página ${sociosPage} de ${sociosTotalPages}`}
          </div>
        </div>
        {selectedIds.size > 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              padding: '12px 32px',
              background: 'var(--accent-pill)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
              {selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Clic derecho para acciones en lote{bulkBusy ? ' · procesando…' : ''}
            </span>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setSelectedIds(new Set())}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-card)',
                cursor: bulkBusy ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Deseleccionar
            </button>
          </div>
        ) : null}
        <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          <table style={{width:'100%',minWidth:640,borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'var(--surface-low)'}}>
                <th style={{ padding:'12px 16px', width: 44 }}>
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id))}
                    onChange={() => toggleSelectAllOnPage()}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Seleccionar todos en la página"
                  />
                </th>
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
                <tr><td colSpan={9} style={{padding:'32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>No hay socios que coincidan con los filtros.</td></tr>
              )}
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => toggleSelectSocio(s.id)}
                  onContextMenu={(e) => openBulkMenu(e, s.id)}
                  style={{
                  borderTop:'1px solid var(--border)',cursor:'pointer',
                  background:selectedIds.has(s.id) ? 'var(--accent-pill)' : selected?.id===s.id ? 'var(--accent-pill)' : 'transparent',
                  transition:'background 0.15s'
                }}
                onMouseEnter={(e) => { if (selected?.id !== s.id && !selectedIds.has(s.id)) e.currentTarget.style.background = 'var(--surface-low)' }}
                onMouseLeave={(e) => { if (selected?.id !== s.id && !selectedIds.has(s.id)) e.currentTarget.style.background = 'transparent' }}
                >
                  <td style={{ padding:'16px 16px' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleSelectSocio(s.id)}
                      aria-label={`Seleccionar ${s.nombre}`}
                    />
                  </td>
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
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '16px 32px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Mostrando {filtered.length} de {sociosTotal.toLocaleString('es-ES')} socios
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              disabled={sociosPage <= 1 || sociosLoading}
              onClick={() => setSociosPage((p) => Math.max(1, p - 1))}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-card)',
                cursor: sociosPage <= 1 || sociosLoading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
                fontWeight: 600,
                opacity: sociosPage <= 1 || sociosLoading ? 0.5 : 1,
              }}
            >
              Anterior
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {sociosPage} / {sociosTotalPages}
            </span>
            <button
              type="button"
              disabled={sociosPage >= sociosTotalPages || sociosLoading}
              onClick={() => setSociosPage((p) => Math.min(sociosTotalPages, p + 1))}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-card)',
                cursor: sociosPage >= sociosTotalPages || sociosLoading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                fontSize: 12,
                fontWeight: 600,
                opacity: sociosPage >= sociosTotalPages || sociosLoading ? 0.5 : 1,
              }}
            >
              Siguiente
            </button>
          </div>
        </div>
        {menuSocioId && (
          <ViewportMenu
            data-socio-menu
            anchor={menuSocioPos}
            style={{
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
                width:'100%',textAlign:'left',padding:'10px 12px',border:'none',borderBottom:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,color:'#44403c',fontWeight:600
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
                setMenuSocioId(null)
                void abrirAplicarCuota(socio)
              }}
              style={{
                width:'100%',textAlign:'left',padding:'10px 12px',border:'none',borderBottom:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,color:'#44403c',fontWeight:600
              }}
            >
              Aplicar cuota
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
          </ViewportMenu>
        )}
        {aplicarCuota && (
          <div
            role="presentation"
            onMouseDown={(e) => { if (e.target === e.currentTarget && !aplicarCuotaBusy) setAplicarCuota(null) }}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, zIndex:1300 }}
          >
            <div style={{ width:'100%', maxWidth:460, background:'#fff', borderRadius:16, padding:24, boxShadow:'0 25px 50px -12px rgba(0,0,0,0.25)' }}>
              <h3 style={{ margin:'0 0 6px', fontSize:18, fontWeight:700 }}>Aplicar cuota</h3>
              <p style={{ margin:'0 0 18px', fontSize:13.5, color:'var(--text-secondary)' }}>
                Socio: <strong>{aplicarCuota.nombre}</strong>
              </p>

              {aplicarCuotaUrl ? (
                <>
                  <div style={{ padding:'10px 14px', borderRadius:10, background:'var(--green-soft)', color:'var(--green)', fontSize:13, fontWeight:600, marginBottom:12 }}>
                    ✓ Cuota aplicada. Enlace de pago copiado al portapapeles.
                  </div>
                  <input
                    readOnly
                    value={aplicarCuotaUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', fontSize:12.5, fontFamily:'ui-monospace, monospace', boxSizing:'border-box' }}
                  />
                  <p style={{ fontSize:12, color:'var(--text-muted)', margin:'8px 0 0' }}>
                    Envíaselo al socio: al pagarlo, su cuota queda activa y se renueva sola.
                  </p>
                  <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:18 }}>
                    <button type="button" onClick={() => { setAplicarCuota(null); setAplicarCuotaUrl('') }}
                      style={{ padding:'10px 18px', borderRadius:10, border:'none', background:'var(--accent)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
                      Hecho
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label style={{ fontSize:13, fontWeight:600, display:'block' }}>
                    Cuota
                    <select
                      value={aplicarCuotaPlanId}
                      onChange={(e) => setAplicarCuotaPlanId(e.target.value)}
                      style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)', fontSize:14, fontFamily:'inherit', marginTop:6, boxSizing:'border-box', cursor:'pointer' }}
                    >
                      {aplicarCuotaPlanes.length === 0 ? (
                        <option value="">No hay cuotas activas</option>
                      ) : (
                        aplicarCuotaPlanes.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {fmtMoney(p.amount)} {p.billingPeriodLabel}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <p style={{ fontSize:12, color:'var(--text-muted)', margin:'10px 0 0' }}>
                    Se le asignará esta cuota (cancelando la anterior si tenía) y se generará su enlace de pago.
                  </p>
                  <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:18 }}>
                    <button type="button" disabled={aplicarCuotaBusy} onClick={() => setAplicarCuota(null)}
                      style={{ padding:'10px 18px', borderRadius:10, border:'1px solid var(--border)', background:'#fff', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>
                      Cancelar
                    </button>
                    <button type="button" disabled={aplicarCuotaBusy || !aplicarCuotaPlanId} onClick={() => void confirmarAplicarCuota()}
                      style={{ padding:'10px 18px', borderRadius:10, border:'none', background:'var(--accent)', color:'#fff', fontWeight:700, fontSize:13, cursor: aplicarCuotaBusy ? 'wait' : 'pointer', fontFamily:'inherit', opacity: aplicarCuotaBusy || !aplicarCuotaPlanId ? 0.6 : 1 }}>
                      {aplicarCuotaBusy ? 'Aplicando…' : 'Aplicar y obtener enlace'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {bulkMenu && selectedIds.size > 0 && (
          <ViewportMenu
            data-socio-menu
            anchor={bulkMenu}
            style={{
              minWidth: 220,
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 14px 26px rgba(15,23,42,0.16)',
              zIndex: 1300,
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
              {selectedIds.size} socio{selectedIds.size === 1 ? '' : 's'}
            </div>
            {[
              { label: 'Enviar mensaje (WhatsApp)…', action: () => { setBulkMenu(null); setBulkMsgText(''); setBulkMsgModal(true) } },
              { label: 'Añadir a grupo…', action: () => { setBulkMenu(null); void cargarGruposOptions(); setBulkGroupModal(true) } },
              { label: 'Exportar selección (CSV)', action: exportarSeleccionCsv },
              { label: 'Asignar cuota…', action: () => { setBulkMenu(null); setBulkPlanId(membershipPlans[0]?.id || ''); setBulkPlanStartDate(''); setBulkPlanModal(true) } },
              { label: 'Marcar como activo', action: () => void runBulkAction('set-status', { status: 'ACTIVE' }) },
              { label: 'Marcar como inactivo', action: () => void runBulkAction('set-status', { status: 'INACTIVE' }) },
              { label: 'Marcar en pausa', action: () => void runBulkAction('set-status', { status: 'PAUSED' }) },
              { label: 'Resetear acceso portal', action: () => void runBulkAction('reset-portal-access', { confirmMessage: `¿Resetear acceso portal de ${selectedIds.size} socio(s)?` }) },
              { label: 'Recordatorio de cobro (WhatsApp)', action: () => void runBulkAction('send-payment-reminder') },
              { label: 'Eliminar seleccionados', danger: true, action: () => void runBulkAction('delete', { confirmMessage: `¿Eliminar ${selectedIds.size} socio(s)? No se puede deshacer.` }) },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={bulkBusy}
                onMouseDown={(e) => e.preventDefault()}
                onClick={item.action}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  background: '#fff',
                  cursor: bulkBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  color: item.danger ? '#b91c1c' : '#44403c',
                  fontWeight: item.danger ? 700 : 600,
                  opacity: bulkBusy ? 0.6 : 1,
                }}
              >
                {item.label}
              </button>
            ))}
          </ViewportMenu>
        )}
      </div>
      {selected && (
        <div style={{
          position:'fixed',top:0,right:0,bottom:0,width:360,
          background:'#fff',boxShadow:'-4px 0 30px rgba(0,0,0,0.12)',
          zIndex:100,padding:28,overflowY:'auto',display:'flex',flexDirection:'column',gap:20
        }}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontWeight:700,fontSize:16,color:'#1c1917'}}>Perfil del Socio</div>
            <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',cursor:'pointer',color:'#8c857d'}}><Icon name="x" size={18}/></button>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'16px 0',borderBottom:'1px solid var(--border)'}}>
            <Avatar initials={selected.avatar} color="#3B82F6" size={64}/>
            <div style={{fontWeight:700,fontSize:18,color:'#1c1917'}}>{selected.nombre}</div>
            <div style={{fontSize:13,color:'#8c857d'}}>{selected.email}</div>
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
              <span style={{fontSize:13,color:'#8c857d'}}>{k}</span>
              <span style={{fontSize:13,fontWeight:600,color:'#1c1917'}}>{v}</span>
            </div>
          ))}
          {/* Data de los formularios (roadmap · Contactos 5.3) */}
          {contactosMode && (() => {
            const fieldLabel = new Map(
              (registrationFieldsConfig || []).map((f) => [f.key, f.label]),
            )
            const extras = Object.entries(selected.registrationExtra || {}).filter(
              ([, v]) => String(v ?? '').trim() !== '',
            )
            const formRows = [
              ['Fecha de nacimiento', selected.fechaNacimiento ? new Date(selected.fechaNacimiento).toLocaleDateString('es-ES') : ''],
              ['Tutor legal', selected.tutorNombre || ''],
              ['Teléfono del tutor', selected.tutorTelefono || ''],
              ...extras.map(([key, v]) => [fieldLabel.get(key) || key, String(v)]),
            ].filter(([, v]) => v !== '')
            return (
              <div style={{marginTop:4}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',padding:'12px 0 4px'}}>
                  Formulario de registro
                </div>
                {formRows.length === 0 ? (
                  <p style={{fontSize:12.5,color:'var(--text-muted)',margin:'6px 0 0'}}>Este contacto no tiene respuestas de formulario.</p>
                ) : (
                  formRows.map(([k, v], idx) => (
                    <div key={`form-${idx}`} style={{display:'flex',justifyContent:'space-between',gap:10,padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:13,color:'#8c857d'}}>{k}</span>
                      <span style={{fontSize:13,fontWeight:600,color:'#1c1917',textAlign:'right'}}>{v}</span>
                    </div>
                  ))
                )}
              </div>
            )
          })()}
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button type="button" onClick={openEditSocioModal} style={{flex:1,padding:'10px',borderRadius:12,border:'1.5px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:600,color:'#44403c'}}>Editar datos</button>
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
              color:'#44403c'
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
                <h2 id="edit-socio-title" style={{ margin: '0 0 6px 0', fontSize: 20, fontWeight: 800, color: '#1c1917', letterSpacing: '-0.4px' }}>
                  Editar datos del socio
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: '#8c857d', lineHeight: 1.5 }}>
                  Los cambios se guardan en el perfil del club.
                </p>
              </div>
              <button
                type="button"
                disabled={editSocioBusy}
                onClick={() => setShowEditSocioModal(false)}
                style={{
                  border: 'none',
                  background: '#f4efe8',
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  cursor: editSocioBusy ? 'not-allowed' : 'pointer',
                  color: '#78716c',
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
                  color: '#44403c',
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
      {bulkMsgModal && (
        <div role="dialog" aria-modal="true" onClick={() => { if (!bulkBusy) setBulkMsgModal(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.45)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 440, boxShadow: 'var(--card-shadow-lg)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Enviar mensaje</h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
              WhatsApp a los {selectedIds.size} contacto{selectedIds.size === 1 ? '' : 's'} seleccionado{selectedIds.size === 1 ? '' : 's'}. Cada envío queda en su hilo del Chat.
            </p>
            <textarea value={bulkMsgText} onChange={(e) => setBulkMsgText(e.target.value)} placeholder="Escribe el mensaje…"
              style={{ width: '100%', minHeight: 100, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}/>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button type="button" disabled={bulkBusy} onClick={() => setBulkMsgModal(false)}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button type="button" disabled={bulkBusy || !bulkMsgText.trim()}
                onClick={async () => { await runBulkAction('send-message', { message: bulkMsgText.trim() }); setBulkMsgModal(false) }}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: bulkBusy || !bulkMsgText.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, opacity: bulkBusy || !bulkMsgText.trim() ? 0.6 : 1 }}>
                {bulkBusy ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {bulkGroupModal && (
        <div role="dialog" aria-modal="true" onClick={() => { if (!bulkBusy) setBulkGroupModal(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.45)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 420, boxShadow: 'var(--card-shadow-lg)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Añadir a grupo</h2>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
              Los {selectedIds.size} seleccionados se añaden al grupo del organigrama con el rol elegido.
            </p>
            {gruposOptions.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No hay grupos. Créalos en Admin → Organigrama.</p>
            ) : (
              <>
                <select value={bulkGroupId} onChange={(e) => setBulkGroupId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 14, background: '#fff', marginBottom: 10 }}>
                  {gruposOptions.map((g) => (
                    <option key={g.id} value={g.id}>{`${'— '.repeat(g.depth)}${g.name}`}</option>
                  ))}
                </select>
                <select value={bulkGroupRole} onChange={(e) => setBulkGroupRole(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 14, background: '#fff' }}>
                  <option value="PLAYER">Jugador</option>
                  <option value="COACH">Entrenador</option>
                  <option value="FAMILY">Familiar</option>
                </select>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" disabled={bulkBusy} onClick={() => setBulkGroupModal(false)}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button type="button" disabled={bulkBusy || !bulkGroupId || gruposOptions.length === 0}
                onClick={async () => { await runBulkAction('add-to-group', { groupId: bulkGroupId, groupRole: bulkGroupRole }); setBulkGroupModal(false) }}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: bulkBusy || !bulkGroupId ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, opacity: bulkBusy || !bulkGroupId ? 0.6 : 1 }}>
                {bulkBusy ? 'Añadiendo…' : 'Añadir al grupo'}
              </button>
            </div>
          </div>
        </div>
      )}
      {bulkPlanModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => { if (!bulkBusy) setBulkPlanModal(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#1c1917' }}>Asignar cuota en lote</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: '#8c857d' }}>
              Se asignará a los {selectedIds.size} socio{selectedIds.size === 1 ? '' : 's'} seleccionado{selectedIds.size === 1 ? '' : 's'}. La cuota activa anterior de cada socio se cancelará.
            </p>
            {membershipPlans.length === 0 ? (
              <p style={{ fontSize: 13, color: '#b91c1c' }}>No hay planes de cuota. Crea uno en «Gestión de cuotas».</p>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#44403c', marginBottom: 6 }}>Plan de cuota *</label>
                <select
                  value={bulkPlanId}
                  onChange={(e) => setBulkPlanId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 14, marginBottom: 16 }}
                >
                  {membershipPlans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {fmtMoney(p.amount)}</option>
                  ))}
                </select>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#44403c', marginBottom: 6 }}>Inicio (opcional)</label>
                <input
                  type="date"
                  value={bulkPlanStartDate}
                  onChange={(e) => setBulkPlanStartDate(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: 14, marginBottom: 22 }}
                />
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setBulkPlanModal(false)}
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: bulkBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#44403c' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={bulkBusy || !bulkPlanId || membershipPlans.length === 0}
                onClick={async () => {
                  const plan = membershipPlans.find((p) => p.id === bulkPlanId)
                  await runBulkAction('assign-plan', {
                    planId: bulkPlanId,
                    startDate: bulkPlanStartDate || undefined,
                    paymentRequiredOnEnrollment: plan?.paymentRequiredOnEnrollment,
                  })
                  setBulkPlanModal(false)
                }}
                style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', cursor: bulkBusy || !bulkPlanId ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#fff', opacity: bulkBusy || !bulkPlanId ? 0.6 : 1 }}
              >
                {bulkBusy ? 'Asignando…' : 'Asignar cuota'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showCsvImport && (
        <MembersCsvImportModal
          open={showCsvImport}
          onClose={() => setShowCsvImport(false)}
          membershipPlans={membershipPlans}
          fmtMoney={fmtMoney}
          showAlert={showAlert}
          onDone={async () => {
            await reload()
            await loadSociosDb()
          }}
        />
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
              background: '#1c1917',
              border: '1px solid #44403c',
              borderRadius: 16,
              padding: 28,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ marginBottom: 22 }}>
              <h2 style={{ margin: '0 0 6px 0', fontSize: 20, fontWeight: 800, color: '#faf7f2', letterSpacing: -0.3 }}>
                Inscripción de socio
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#a8a29e', lineHeight: 1.5 }}>
                Completa los datos aquí mismo (sin pop-ups del navegador).
              </p>
            </div>
            <RegistrationFieldsForm
              fields={registrationFieldsConfig}
              values={registrationValues}
              onChange={(key, value) =>
                setRegistrationValues((prev) => ({ ...prev, [key]: value }))
              }
              variant="crm"
              disabled={inscripcionBusy}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={insLabel}>Fecha de alta</label>
                <input
                  type="date"
                  value={formInscripcionAdmin.fechaAlta}
                  onChange={(e) =>
                    setFormInscripcionAdmin((p) => ({ ...p, fechaAlta: e.target.value }))
                  }
                  style={insInput}
                />
              </div>
              {membershipPlans.length > 0 ? (
                <>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={insLabel}>Plan de cuota *</label>
                    <select
                      required={membershipPlans.length > 1}
                      value={formInscripcionAdmin.planId}
                      onChange={(e) => {
                        const planId = e.target.value
                        setFormInscripcionAdmin((p) => ({
                          ...p,
                          planId,
                          paymentRequiredOnEnrollment: planPaymentRequiredDefault(planId),
                        }))
                      }}
                      style={{ ...insInput, cursor: 'pointer' }}
                    >
                      {membershipPlans.length > 1 && (
                        <option value="">Selecciona un plan…</option>
                      )}
                      {membershipPlans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {fmtMoney(p.amount)} / {p.billingPeriodLabel}
                          {p.enrollmentFee > 0 ? ` (+ matrícula ${fmtMoney(p.enrollmentFee)})` : ''}
                        </option>
                      ))}
                    </select>
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: '#78716c', lineHeight: 1.45 }}>
                      Al guardar se genera la primera factura en Mis pagos del socio.
                    </p>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        cursor: 'pointer',
                        fontSize: 13,
                        color: '#d8cdbd',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formInscripcionAdmin.paymentRequiredOnEnrollment}
                        onChange={(e) =>
                          setFormInscripcionAdmin((p) => ({
                            ...p,
                            paymentRequiredOnEnrollment: e.target.checked,
                          }))
                        }
                        style={{ marginTop: 3 }}
                      />
                      <span>
                        <strong style={{ color: '#faf7f2' }}>Pago obligatorio al alta</strong>
                        <br />
                        <span style={{ color: '#a8a29e' }}>
                          El socio queda pendiente de pago hasta abonar la primera cuota en Mis pagos.
                        </span>
                      </span>
                    </label>
                  </div>
                </>
              ) : (
                <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#fbbf24', lineHeight: 1.5 }}>
                  No hay planes de cuota activos. Crea uno en Gestión de cuotas para que el socio vea cobros en Mis pagos.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                disabled={inscripcionBusy}
                onClick={() => setShowInscripcion(false)}
                style={{
                  padding: '11px 20px',
                  borderRadius: 10,
                  border: '1px solid #57534e',
                  background: 'transparent',
                  color: '#d8cdbd',
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
// ── COBROS ──────────────────────────────────────────────────────────────────
function Contabilidad({ setActive }) {
  const { bundle, reload, fmtMoney, showAlert, showConfirm } = useCrm();
  const role = normalizeRole(bundle?.user?.role)
  if (!(role === 'ADMIN' || role === 'TREASURER')) return null
  const COBROS_UI = bundle?.cobros ?? [];
  const sociosTotal = Number(bundle?.kpis?.sociosTotal || 0);
  const EQUIPOS_UI = bundle?.equipos ?? [];
  const countTeamPlayers = (eq) =>
    (eq?.miembros ?? []).filter((m) => m.role === 'PLAYER').length
  const equiposConJugadores = EQUIPOS_UI.filter((eq) => countTeamPlayers(eq) > 0)
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
  const [buscarCobro, setBuscarCobro] = useState('');
  const [facturasData, setFacturasData] = useState({
    cobros: [], total: 0, page: 1, totalPages: 1,
    totales: { total: 0, pendiente: 0, pagado: 0, vencido: 0 },
  });
  const [facturasPage, setFacturasPage] = useState(1);
  const [facturasLoading, setFacturasLoading] = useState(true);
  const [facturasError, setFacturasError] = useState('');
  const [cobroModal, setCobroModal] = useState(null);
  const [cobroBusy, setCobroBusy] = useState(false);
  /** Facturas marcadas para actuar sobre varias a la vez. */
  const [facturasSel, setFacturasSel] = useState(() => new Set());
  const [loteBusy, setLoteBusy] = useState(false);
  const [editarModal, setEditarModal] = useState(null);
  const [editarBusy, setEditarBusy] = useState(false);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState({ abierto: false, name: '', nature: 'EXPENSE' });
  const [categoriaBusy, setCategoriaBusy] = useState(false);
  // Qué partes de la contabilidad no se pudieron cargar. Sin esto, un fallo del
  // servidor dejaba las listas vacías y la pantalla afirmaba «Sin asientos»: el
  // tesorero creía que se había perdido la contabilidad del club.
  const [ledgerError, setLedgerError] = useState('');
  const [ledgerData, setLedgerData] = useState<{
    entries: any[]
    accounts: any[]
    periods: any[]
    reports: any | null
  }>({ entries: [], accounts: [], periods: [], reports: null });
  const [nuevoCobroForm, setNuevoCobroForm] = useState({
    target: 'member',
    memberId: '',
    groupId: '',
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
  const tabs = ['Todos','Pendiente','Pago parcial','Vencido','Pagado'];
  // Los identificadores siguen siendo los mismos; lo que cambia es lo que se lee.
  const contaTabs = PESTANAS_CONTABLES.map((t) => t.id);
  const pestanaActual = PESTANAS_CONTABLES.find((t) => t.id === contaTab);
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
  const buscado = buscarCobro.trim()
  const filtered = facturasData.cobros
  const cobrosEnRango = filtered
  const totales = {
    total: Number(facturasData.totales?.total || 0) + ingresosManuales,
    pendiente: Number(facturasData.totales?.pendiente || 0),
    pagado: Number(facturasData.totales?.pagado || 0) + ingresosManuales,
    vencido: Number(facturasData.totales?.vencido || 0),
  };

  /** Trae la página de facturas que toca, con los filtros aplicados en el servidor. */
  const cargarFacturas = useCallback(async (page, q, estado, desde, hasta) => {
    setFacturasLoading(true)
    setFacturasError('')
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (q) params.set('q', q)
      if (estado && estado !== 'Todos') params.set('estado', estado)
      if (desde) params.set('from', desde)
      if (hasta) params.set('to', hasta)
      const r = await fetch('/api/crm/invoices?' + params.toString(), {
        credentials: 'include', cache: 'no-store',
      })
      if (!r.ok) {
        setFacturasError('No se pudieron cargar las facturas. Comprueba tu conexión y vuelve a intentarlo.')
        return
      }
      setFacturasData(await r.json())
    } catch {
      setFacturasError('No se pudieron cargar las facturas. Comprueba tu conexión y vuelve a intentarlo.')
    } finally {
      setFacturasLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      void cargarFacturas(facturasPage, buscarCobro.trim(), tab, fechaDesde, fechaHasta)
    }, 250)
    return () => clearTimeout(t)
  }, [cargarFacturas, facturasPage, buscarCobro, tab, fechaDesde, fechaHasta])

  // Al cambiar cualquier filtro se vuelve a la primera página: si no, se
  // buscaría dentro de la página 3 del filtro anterior.
  useEffect(() => { setFacturasPage(1) }, [buscarCobro, tab, fechaDesde, fechaHasta])

  /**
   * Categorías que un club deportivo necesita de verdad.
   *
   * De fábrica solo hay tres cuentas de gasto («Compras», «Otros servicios»,
   * «Sueldos»), así que el tesorero acababa metiendo arbitrajes, autobuses y
   * equipaciones en el mismo saco y luego no podía explicar en qué se fue el
   * dinero. El código contable lo pone el servidor.
   */
  const CATEGORIAS_SUGERIDAS = {
    EXPENSE: ['Arbitrajes', 'Desplazamientos', 'Material deportivo', 'Equipaciones',
              'Alquiler de instalaciones', 'Licencias y federación', 'Seguros', 'Mutualidad'],
    INCOME: ['Patrocinios', 'Subvenciones', 'Rifas y sorteos', 'Bar y cantina',
             'Inscripciones a torneos', 'Venta de material'],
  }

  async function cerrarPeriodo(periodo, cerrar) {
    const ok = await showConfirm({
      title: cerrar ? `Cerrar ${periodo.code}` : `Reabrir ${periodo.code}`,
      message: cerrar
        ? 'Un periodo cerrado queda como constancia de que esas cuentas ya estan dadas por buenas.\n\nPuedes reabrirlo cuando quieras.'
        : 'Vuelve a quedar abierto para poder corregir sus movimientos.',
      confirmLabel: cerrar ? 'Cerrar periodo' : 'Reabrir',
    }).catch(() => false)
    if (!ok) return
    const r = await fetch('/api/crm/accounting/periods/' + encodeURIComponent(periodo.id), {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isClosed: cerrar }),
    })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      showAlert(j.error || 'No se pudo cambiar el periodo')
      return
    }
    await loadAccounting()
  }

  async function crearCategoria(nombre, naturaleza) {
    const name = String(nombre || '').trim()
    if (!name || categoriaBusy) return
    setCategoriaBusy(true)
    try {
      const r = await fetch('/api/crm/accounting/accounts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, nature: naturaleza }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo crear la categoría'); return }
      setNuevaCategoria({ abierto: false, name: '', nature: naturaleza })
      await loadAccounting()
      showAlert(`Categoría «${name}» creada. Ya puedes usarla al registrar un movimiento.`)
    } finally {
      setCategoriaBusy(false)
    }
  }

  const loadAccounting = useCallback(async () => {
    setLedgerBusy(true);
    try {
      const [entriesR, accountsR, periodsR, reportsR] = await Promise.all([
        fetch('/api/crm/accounting/entries', { credentials: 'include' }),
        fetch('/api/crm/accounting/accounts', { credentials: 'include' }),
        fetch('/api/crm/accounting/periods', { credentials: 'include' }),
        fetch('/api/crm/accounting/reports', { credentials: 'include' }),
      ]);
      const fallidas = [
        entriesR.ok ? null : 'los asientos',
        accountsR.ok ? null : 'las cuentas',
        periodsR.ok ? null : 'los periodos',
        reportsR.ok ? null : 'los informes',
      ].filter(Boolean);
      setLedgerError(
        fallidas.length === 0
          ? ''
          : `No se pudieron cargar ${fallidas.join(', ')}. Lo que ves abajo está incompleto.`,
      );
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
    loadAccounting().catch(() =>
      setLedgerError('No se pudo conectar con el servidor para cargar la contabilidad.'),
    );
  }, [loadAccounting]);

  /**
   * Corregir una factura ya emitida que todavía no se ha cobrado.
   *
   * Una errata en el concepto obligaba a eliminarla y volver a emitirla con otro
   * número, dejando un hueco en la numeración de un documento contable.
   */
  function abrirEdicion(c) {
    setEditarModal({
      id: c.id,
      numero: c.numero,
      socio: c.socio,
      concepto: String(c.concepto || ''),
      // La base imponible, no el total: es lo que el servidor espera y lo que
      // hay que enseñar. Prerrellenarlo con el total hacía que corregir el
      // concepto subiera la base de 100 a 121 sin que nadie tocara el importe.
      importe: Number(c.subtotal ?? c.monto ?? 0).toFixed(2),
      llevaImpuestos: Math.abs(Number(c.monto ?? 0) - Number(c.subtotal ?? c.monto ?? 0)) > 0.005,
      vencimiento: String(c.vencimiento || '').slice(0, 10),
      cobrado: Number(c.monto || 0) - Number(c.pendingAmount ?? c.monto ?? 0) > 0.005,
    })
  }

  async function guardarEdicion() {
    if (!editarModal || editarBusy) return
    const importe = Number(String(editarModal.importe).replace(',', '.'))
    if (!editarModal.cobrado && (!Number.isFinite(importe) || importe <= 0)) {
      showAlert('Escribe un importe válido.')
      return
    }
    if (!editarModal.concepto.trim()) {
      showAlert('El concepto no puede quedar vacío.')
      return
    }
    setEditarBusy(true)
    try {
      const r = await fetch('/api/crm/invoices/' + editarModal.id, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dueDate: editarModal.vencimiento,
          // Con cobros registrados el servidor solo acepta la fecha.
          ...(editarModal.cobrado ? {} : { concepto: editarModal.concepto.trim(), amount: importe }),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo guardar'); return }
      setEditarModal(null)
      await Promise.all([reload(), loadAccounting(), cargarFacturas(facturasPage, buscarCobro.trim(), tab, fechaDesde, fechaHasta)])
      showAlert('Factura corregida.')
    } finally {
      setEditarBusy(false)
    }
  }

  function alternarFactura(id) {
    setFacturasSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /**
   * Da por cobradas varias facturas de una vez, cada una por su importe
   * pendiente. Es lo que hace el tesorero el día que recoge los sobres.
   */
  async function cobrarSeleccionadas(metodo) {
    const ids = [...facturasSel]
    if (ids.length === 0 || loteBusy) return
    const seleccionadas = filtered.filter((c) => facturasSel.has(c.id))
    const total = seleccionadas.reduce((a, c) => a + Number(c.pendingAmount ?? c.monto ?? 0), 0)
    const ok = await showConfirm({
      title: `Registrar el cobro de ${ids.length} factura${ids.length === 1 ? '' : 's'}`,
      message:
        `${fmtMoney(total)} en total, ${metodo === 'CASH' ? 'en efectivo' : 'por transferencia'} y con fecha de hoy.

` +
        'De cada una se cobra su importe pendiente completo. Se crearán los apuntes contables.',
      confirmLabel: `Cobrar ${fmtMoney(total)}`,
    }).catch(() => false)
    if (!ok) return

    setLoteBusy(true)
    try {
      const fallos = []
      // En serie a propósito: cada cobro escribe en la factura y en la
      // contabilidad, y lanzarlos en paralelo se pisaría entre sí.
      for (const c of seleccionadas) {
        try {
          const r = await fetch('/api/crm/invoices/' + c.id + '/mark-paid', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: metodo }),
          })
          if (!r.ok) {
            const j = await r.json().catch(() => ({}))
            fallos.push(`${c.socio}: ${j.error || 'no se pudo cobrar'}`)
          }
        } catch {
          fallos.push(`${c.socio}: error de conexión`)
        }
      }
      setFacturasSel(new Set())
      await Promise.all([reload(), loadAccounting(), cargarFacturas(facturasPage, buscarCobro.trim(), tab, fechaDesde, fechaHasta)])
      showAlert(
        fallos.length === 0
          ? `${ids.length} factura${ids.length === 1 ? '' : 's'} cobrada${ids.length === 1 ? '' : 's'}.`
          : `${ids.length - fallos.length} cobradas. No se pudo con ${fallos.length}:\n\n${fallos.slice(0, 4).join('\n')}`,
        fallos.length ? 'Cobros con incidencias' : undefined,
      )
    } finally {
      setLoteBusy(false)
    }
  }

  /** Abre el modal para registrar un cobro con importe y forma de pago. */
  function abrirCobro(c) {
    const pendiente = Number(c?.pendingAmount ?? c?.monto ?? 0)
    setCobroModal({
      id: c.id,
      numero: c.numero,
      socio: c.socio,
      pendiente,
      importe: pendiente.toFixed(2),
      metodo: 'CASH',
      referencia: '',
    })
  }

  async function registrarCobro() {
    if (!cobroModal || cobroBusy) return
    const importe = Number(String(cobroModal.importe).replace(',', '.'))
    if (!Number.isFinite(importe) || importe <= 0) {
      showAlert('Escribe un importe válido.')
      return
    }
    if (importe > cobroModal.pendiente + 0.005) {
      showAlert(`No puedes cobrar más de lo que se debe (${fmtMoney(cobroModal.pendiente)}).`)
      return
    }
    setCobroBusy(true)
    try {
      const r = await fetch('/api/crm/invoices/' + cobroModal.id + '/mark-paid', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: importe,
          method: cobroModal.metodo,
          bankReference: cobroModal.referencia || undefined,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo registrar el cobro'); return }
      setCobroModal(null)
      await Promise.all([reload(), loadAccounting(), cargarFacturas(facturasPage, buscarCobro.trim(), tab, fechaDesde, fechaHasta)])
      showAlert(
        Number(j.pending || 0) > 0
          ? `Cobro registrado. Quedan ${fmtMoney(Number(j.pending))} por cobrar.`
          : 'Factura cobrada por completo.',
      )
    } finally {
      setCobroBusy(false)
    }
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
    // Se copia el NÚMERO de factura, que es lo que el socio y el banco
    // reconocen; el identificador interno no le sirve a nadie.
    const texto = String(c.numero || c.id)
    try {
      await navigator.clipboard.writeText(texto)
      showAlert(`Copiado: ${texto}`)
    } catch {
      // El navegador puede bloquear el portapapeles: antes no pasaba nada y el
      // tesorero se quedaba creyendo que lo había copiado.
      showAlert(`No se pudo copiar automáticamente. El número es: ${texto}`)
    }
  }

  async function eliminarCobro(c) {
    const invoiceId = String(c?.id || '').trim()
    if (!invoiceId) return
    if (deletingCobroId === invoiceId) return
    const ok = await showConfirm({
      title: `Eliminar la factura ${c.numero || ''}`,
      message:
        `${c.concepto} · ${c.socio} · ${fmtMoney(Number(c.monto || 0))}\n\n` +
        'Desaparece del histórico del socio junto con su apunte contable. No se puede deshacer.',
      confirmLabel: 'Eliminar factura',
      danger: true,
    })
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
      await Promise.all([reload(), loadAccounting(), cargarFacturas(facturasPage, buscarCobro.trim(), tab, fechaDesde, fechaHasta)])
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
    if (!sociosTotal && !equiposConJugadores.length) {
      showAlert('No hay socios ni equipos con jugadores para facturar.')
      return
    }
    const today = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 5)
    const dueDate = `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-${pad(nextMonth.getDate())}`
    setNuevoCobroForm({
      target: sociosTotal ? 'member' : 'team',
      memberId: '',
      groupId: equiposConJugadores[0]?.id || '',
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
    const target = nuevoCobroForm.target === 'team' ? 'team' : 'member'
    const memberId = String(nuevoCobroForm.memberId || '').trim()
    const groupId = String(nuevoCobroForm.groupId || '').trim()
    const concepto = String(nuevoCobroForm.concepto || '').trim()
    const dueDate = String(nuevoCobroForm.dueDate || '').trim()
    const amount = Number(nuevoCobroForm.amount)
    const applyTax = Boolean(nuevoCobroForm.applyTax)
    const taxRate = Number(nuevoCobroForm.taxRate)
    const applyWithholding = Boolean(nuevoCobroForm.applyWithholding)
    const withholdingRate = Number(nuevoCobroForm.withholdingRate)
    if (target === 'member' && !memberId) {
      showAlert('Selecciona el socio al que corresponde el cobro.')
      return
    }
    if (target === 'team') {
      if (!groupId) {
        showAlert('Selecciona el equipo al que corresponde el cobro.')
        return
      }
      const selectedTeam = EQUIPOS_UI.find((eq) => eq.id === groupId)
      if (!selectedTeam || countTeamPlayers(selectedTeam) === 0) {
        showAlert('El equipo seleccionado no tiene jugadores a los que facturar.')
        return
      }
    }
    if (!concepto || !dueDate || !Number.isFinite(amount) || amount <= 0) {
      showAlert('Completa concepto, importe y vencimiento.')
      return
    }

    // Facturar a un equipo emite N facturas numeradas y avisa a N familias. Una
    // vez emitidas no se pueden corregir, solo borrar, así que se pregunta antes
    // diciendo a cuántos afecta y por cuánto en total.
    if (target === 'team') {
      const equipo = EQUIPOS_UI.find((eq) => eq.id === groupId)
      const jugadores = countTeamPlayers(equipo || {})
      const neto =
        amount * (applyTax ? 1 + (Number.isFinite(taxRate) ? taxRate : 0) / 100 : 1) -
        amount * (applyWithholding ? (Number.isFinite(withholdingRate) ? withholdingRate : 0) / 100 : 0)
      const ok = await showConfirm({
        title: `Vas a emitir ${jugadores} facturas`,
        message:
          `Equipo: ${equipo?.name || 'sin nombre'}\n` +
          `Concepto: ${concepto}\n` +
          `${fmtMoney(neto)} por jugador · ${fmtMoney(neto * jugadores)} en total\n\n` +
          `Cada familia recibirá su aviso de cobro. Una factura emitida no se puede editar después.`,
        confirmLabel: `Emitir ${jugadores} facturas`,
      }).catch(() => false)
      if (!ok) return
    }

    setNuevoCobroBusy(true)
    try {
      const payload = {
        concepto,
        amount,
        dueDate,
        applyTax,
        taxRate: Number.isFinite(taxRate) ? taxRate : 0,
        applyWithholding,
        withholdingRate: Number.isFinite(withholdingRate) ? withholdingRate : 0,
        ...(target === 'team' ? { groupId } : { memberId }),
      }
      const r = await fetch('/api/crm/invoices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      const result = await r.json().catch(() => ({}))
      setShowNuevoCobroModal(false)
      await reload()
      if (target === 'team') {
        const count = Number(result?.count || 0)
        showAlert(
          count > 0
            ? `${count} facturas creadas. Cada jugador la verá en Mis pagos con el botón Pagar.`
            : 'Facturas creadas. Cada jugador la verá en Mis pagos con el botón Pagar.',
        )
      } else {
        showAlert('Factura creada. El socio la verá en Mis pagos con el botón Pagar.')
      }
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
      await Promise.all([reload(), loadAccounting(), cargarFacturas(facturasPage, buscarCobro.trim(), tab, fechaDesde, fechaHasta)])
    } finally {
      setMovimientoBusy(false)
    }
  }

  /**
   * Anula un asiento con su contra-asiento, en vez de borrarlo.
   *
   * Un libro contable no se corrige borrando: se corrige con un apunte que
   * deshace el anterior, y los dos quedan a la vista. Borrar dejaba un hueco en
   * la numeración y hacía imposible explicar qué había pasado.
   */
  async function anularAsiento(entry: any) {
    const entryId = String(entry?.id || '').trim()
    if (!entryId) return
    if (deletingMovementId === entryId) return
    const ok = await showConfirm({
      title: 'Anular este asiento',
      message:
        `${entry?.description || ''}

` +
        'Se creará un asiento inverso que lo deja a cero. Los dos quedan en el ' +
        'Diario, que es como se corrige un libro contable.',
      confirmLabel: 'Anular asiento',
    })
    if (!ok) return
    setDeletingMovementId(entryId)
    try {
      const r = await fetch(`/api/crm/accounting/entries/${encodeURIComponent(entryId)}/reverse`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Anulado desde el CRM' }),
      })
      if (!r.ok) {
        let msg = 'No se pudo anular el asiento'
        try { msg = (await r.json()).error || msg } catch { /* */ }
        showAlert(msg)
        return
      }
      await Promise.all([reload(), loadAccounting(), cargarFacturas(facturasPage, buscarCobro.trim(), tab, fechaDesde, fechaHasta)])
    } finally {
      setDeletingMovementId(null)
    }
  }

  async function eliminarMovimientoManual(entry: any) {
    const movementId = String(entry?.sourceId || '').trim()
    if (!movementId) {
      showAlert('Este asiento no tiene un movimiento manual asociado.')
      return
    }
    if (deletingMovementId === movementId) return
    const ok = await showConfirm({
      title: 'Eliminar este movimiento',
      message:
        `${entry?.description || ''}\n\n` +
        'Se borra también su asiento contable, así que los informes cambiarán. No se puede deshacer.',
      confirmLabel: 'Eliminar movimiento',
      danger: true,
    })
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
      await Promise.all([reload(), loadAccounting(), cargarFacturas(facturasPage, buscarCobro.trim(), tab, fechaDesde, fechaHasta)])
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
        const raw = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
        return raw.charAt(0).toUpperCase() + raw.slice(1)
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
            <h1 style={{fontSize:28,fontWeight:700,color:'var(--text-primary)',letterSpacing:'-0.02em',margin:0,lineHeight:1.1}}>Facturas</h1>
            <p style={{color:'var(--text-secondary)',fontSize:14,marginTop:6,margin:0}}>Meter y sacar facturas: cobros, movimientos, diario, mayor y balances</p>
          </div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            <button
              type="button"
              onClick={() => {
                const q = new URLSearchParams()
                if (fechaDesde) q.set('from', fechaDesde)
                if (fechaHasta) q.set('to', fechaHasta)
                const qs = q.toString()
                window.location.href = '/api/billing/reports/invoices-csv' + (qs ? `?${qs}` : '')
              }}
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
              onClick={openNuevoCobroModal}
              style={{
                display:'flex',alignItems:'center',gap:8,padding:'10px 18px',
                borderRadius:8,border:'none',background:'var(--accent)',
                cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,color:'#fff',
                transition:'all 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
            >
              <Icon name="plus" size={15}/>Nueva factura
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

        {/* Roadmap 6.1/6.2: los KPIs y la tesorería viven en Contabilidad → Sumario
            (solo lectura); esta pantalla es la gestión pura de facturas y movimientos. */}
        {false && (<>
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
          />
          <KPICard
            label="Gastos (mes)"
            value={fmtMoney(gastosMesMov)}
            sub={`${numFacturasGasto} ${numFacturasGasto === 1 ? 'factura' : 'facturas'}`}
            icon="billing"
            color="var(--red)"
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
        </>)}
      {/* Tabs PGC + Cobros */}
      <div style={{display:'flex',gap:4,background:'var(--surface-low)',borderRadius:999,padding:4,width:'fit-content'}}>
        {PESTANAS_CONTABLES.map((t) => (
          <button key={t.id} type="button" onClick={() => setContaTab(t.id)} title={t.ayuda} style={{
            padding:'8px 18px',borderRadius:999,border:'none',cursor:'pointer',
            background:contaTab===t.id?'var(--surface-card)':'transparent',
            color:contaTab===t.id?'var(--accent)':'var(--text-muted)',
            fontFamily:'inherit',fontSize:12,fontWeight:700,letterSpacing:'0.02em',
            boxShadow: contaTab===t.id ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
            transition:'all 0.15s'
          }}>{t.label}</button>
        ))}
      </div>
      {pestanaActual && (
        <div style={{fontSize:13,color:'var(--text-secondary)',marginTop:-14}}>{pestanaActual.ayuda}</div>
      )}

      <div style={{background:'var(--surface-card)',border:'1px solid var(--border)',borderRadius:12,padding:'16px 20px',display:'flex',gap:14,alignItems:'center',flexWrap:'wrap',boxShadow:'var(--card-shadow)'}}>
        <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)',minWidth:130,letterSpacing:'0.02em'}}>Configuración impuestos</div>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#57534e'}}>
          IVA ingreso %
          <input type="number" min={0} step="0.01" value={taxConfigForm.vatRateIncome} onChange={(e)=>setTaxConfigForm((s)=>({...s,vatRateIncome:e.target.value}))} style={{width:78,padding:'6px 8px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit'}} />
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#57534e'}}>
          IVA gasto %
          <input type="number" min={0} step="0.01" value={taxConfigForm.vatRateExpense} onChange={(e)=>setTaxConfigForm((s)=>({...s,vatRateExpense:e.target.value}))} style={{width:78,padding:'6px 8px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit'}} />
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#57534e'}}>
          Retención ingreso %
          <input type="number" min={0} step="0.01" value={taxConfigForm.withholdRateIncome} onChange={(e)=>setTaxConfigForm((s)=>({...s,withholdRateIncome:e.target.value}))} style={{width:78,padding:'6px 8px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit'}} />
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#57534e'}}>
          Retención gasto %
          <input type="number" min={0} step="0.01" value={taxConfigForm.withholdRateExpense} onChange={(e)=>setTaxConfigForm((s)=>({...s,withholdRateExpense:e.target.value}))} style={{width:78,padding:'6px 8px',border:'1px solid var(--border)',borderRadius:8,fontFamily:'inherit'}} />
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#57534e'}}>
          <input type="checkbox" checked={taxConfigForm.applyOnInvoices} onChange={(e)=>setTaxConfigForm((s)=>({...s,applyOnInvoices:e.target.checked}))}/>
          Aplicar en cobros
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#57534e'}}>
          <input type="checkbox" checked={taxConfigForm.applyOnIncome} onChange={(e)=>setTaxConfigForm((s)=>({...s,applyOnIncome:e.target.checked}))}/>
          Aplicar en ingresos
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#57534e'}}>
          <input type="checkbox" checked={taxConfigForm.applyOnExpense} onChange={(e)=>setTaxConfigForm((s)=>({...s,applyOnExpense:e.target.checked}))}/>
          Aplicar en gastos
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#57534e'}}>
          <input type="checkbox" checked={taxConfigForm.applyWithholdOnInvoices} onChange={(e)=>setTaxConfigForm((s)=>({...s,applyWithholdOnInvoices:e.target.checked}))}/>
          Retención en cobros
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#57534e'}}>
          <input type="checkbox" checked={taxConfigForm.applyWithholdOnIncome} onChange={(e)=>setTaxConfigForm((s)=>({...s,applyWithholdOnIncome:e.target.checked}))}/>
          Retención en ingresos
        </label>
        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#57534e'}}>
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
          <div style={{fontSize:13,color:'#78716c'}}>Cargando datos contables…</div>
        ) : ledgerError ? (
          <div style={{fontSize:13}}>
            <div style={{color:'var(--red)',fontWeight:600,marginBottom:10}}>{ledgerError}</div>
            <button type="button" onClick={() => { void loadAccounting() }}
              style={{padding:'8px 16px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700}}>
              Reintentar
            </button>
          </div>
        ) : contaTab === 'DIARIO' ? (
          <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:380,overflowY:'auto'}}>
            {ledgerData.entries.map((e) => (
              <div key={e.id} style={{padding:'10px 12px',border:'1px solid var(--border)',borderRadius:10}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:12}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:'#1c1917'}}>{e.entryNumber} · {e.concept}</div>
                    <div style={{fontSize:12,color:'#78716c'}}>
                      {new Date(e.entryDate).toLocaleDateString('es-ES')} · {etiqueta(ESTADO_ASIENTO, e.status)} · {etiqueta(ORIGEN_ASIENTO, e.source)}
                    </div>
                  </div>
                  {e.source === 'MANUAL' && e.sourceId && (
                    <button
                      type="button"
                      disabled={deletingMovementId === e.id || deletingMovementId === e.sourceId}
                      onClick={() => anularAsiento(e)}
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
                      {deletingMovementId === e.id ? 'Anulando…' : 'Anular'}
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
                      <span style={{color:'#44403c'}}>
                        {l.account?.code} · {l.account?.name}
                        {l.lineConcept ? ` · ${l.lineConcept}` : ''}
                      </span>
                      <span style={{fontWeight:700,color:'#1c1917'}}>{fmtMoney(Number(l.amount || 0))}</span>
                    </div>
                  ))}
                  <div style={{display:'flex',justifyContent:'flex-end',fontSize:12,color:'#57534e',fontWeight:700}}>
                    Total asiento: {fmtMoney((e.lines || []).reduce((a: number, l: any) => a + Number(l.amount || 0), 0) / 2)}
                  </div>
                </div>
              </div>
            ))}
            {ledgerData.entries.length === 0 && <div style={{fontSize:13,color:'#78716c'}}>Sin asientos.</div>}
          </div>
        ) : contaTab === 'MAYOR' ? (
          <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:420,overflowY:'auto'}}>
            {(ledgerData.reports?.trialBalance || []).length === 0 && (
              <div style={{fontSize:13,color:'#78716c'}}>Todavía no hay movimientos contabilizados.</div>
            )}
            {(ledgerData.reports?.trialBalance || []).map((r: any) => {
              // El saldo se pintaba siempre como debe − haber, así que los
              // ingresos salían en NEGATIVO: la pantalla decía que el club había
              // ingresado −4.200 €. Cada naturaleza tiene su signo.
              const negativas = r.nature === 'INCOME' || r.nature === 'LIABILITY' || r.nature === 'EQUITY'
              const saldo = negativas
                ? (r.credit || 0) - (r.debit || 0)
                : (r.debit || 0) - (r.credit || 0)
              return (
                <div key={r.code} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,padding:'12px 14px',border:'1px solid var(--border)',borderRadius:10,fontSize:13,alignItems:'center'}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:600,color:'var(--text-primary)'}}>{r.name}</div>
                    <div style={{fontSize:11.5,color:'var(--text-muted)',marginTop:2}}>
                      {etiqueta(NATURALEZA_CUENTA, r.nature)} · {r.code}
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontWeight:700,fontSize:15,color: saldo < 0 ? 'var(--red)' : 'var(--text-primary)',fontVariantNumeric:'tabular-nums'}}>
                      {fmtMoney(saldo)}
                    </div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                      Entradas {fmtMoney(r.debit)} · Salidas {fmtMoney(r.credit)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : contaTab === 'CUENTAS' ? (
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <span style={{fontSize:13,color:'var(--text-secondary)'}}>
                Cada movimiento se clasifica en una de estas casillas. Cuantas más tengas, mejor
                podrás explicar en qué se va el dinero.
              </span>
              <button type="button" onClick={() => setNuevaCategoria((v) => ({ ...v, abierto: !v.abierto }))}
                style={{padding:'8px 16px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,whiteSpace:'nowrap'}}>
                {nuevaCategoria.abierto ? 'Cerrar' : '+ Nueva categoría'}
              </button>
            </div>

            {nuevaCategoria.abierto && (
              <div style={{padding:16,border:'1px solid var(--border)',borderRadius:12,background:'var(--surface-low)',display:'flex',flexDirection:'column',gap:12}}>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {['EXPENSE','INCOME'].map((nat) => (
                    <button key={nat} type="button" onClick={() => setNuevaCategoria((v) => ({ ...v, nature: nat }))}
                      style={{padding:'7px 16px',borderRadius:999,border:'1px solid var(--border)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,
                        background: nuevaCategoria.nature === nat ? 'var(--accent)' : 'var(--surface-card)',
                        color: nuevaCategoria.nature === nat ? '#fff' : 'var(--text-secondary)'}}>
                      {nat === 'EXPENSE' ? 'Un gasto' : 'Un ingreso'}
                    </button>
                  ))}
                </div>

                <div>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--text-muted)',marginBottom:8}}>
                    Las más habituales en un club — pulsa para añadirla
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {CATEGORIAS_SUGERIDAS[nuevaCategoria.nature]
                      .filter((c) => !ledgerData.accounts.some((a) => a.name.toLowerCase() === c.toLowerCase()))
                      .map((c) => (
                        <button key={c} type="button" disabled={categoriaBusy}
                          onClick={() => crearCategoria(c, nuevaCategoria.nature)}
                          style={{padding:'6px 12px',borderRadius:999,border:'1px dashed var(--border-strong)',background:'var(--surface-card)',color:'var(--text-primary)',cursor:categoriaBusy?'wait':'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                          + {c}
                        </button>
                      ))}
                  </div>
                </div>

                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <input
                    value={nuevaCategoria.name}
                    onChange={(e) => setNuevaCategoria((v) => ({ ...v, name: e.target.value }))}
                    placeholder="…o escribe otra"
                    style={{flex:'1 1 200px',minWidth:180,padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,background:'var(--surface-card)'}}
                  />
                  <button type="button" disabled={categoriaBusy || !nuevaCategoria.name.trim()}
                    onClick={() => crearCategoria(nuevaCategoria.name, nuevaCategoria.nature)}
                    style={{padding:'9px 16px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',cursor:categoriaBusy?'wait':'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,opacity: nuevaCategoria.name.trim() ? 1 : 0.5}}>
                    Crear
                  </button>
                </div>
              </div>
            )}

          <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:380,overflowY:'auto'}}>
            {ledgerData.accounts.length === 0 && (
              <div style={{fontSize:13,color:'#78716c'}}>No hay categorías todavía.</div>
            )}
            {ledgerData.accounts.map((a) => (
              <div key={a.id} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'12px 14px',border:'1px solid var(--border)',borderRadius:10,fontSize:13,alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:600,color:'var(--text-primary)'}}>{a.name}</div>
                  <div style={{fontSize:11.5,color:'var(--text-muted)',marginTop:2}}>{a.code}</div>
                </div>
                <span style={{fontSize:11.5,fontWeight:700,color:'var(--accent)',background:'var(--accent-pill)',padding:'3px 10px',borderRadius:999,whiteSpace:'nowrap'}}>
                  {etiqueta(NATURALEZA_CUENTA, a.nature)}
                </span>
              </div>
            ))}
          </div>
          </div>
        ) : (() => {
          const pnl = ledgerData.reports?.pnl || []
          const ingresos = pnl.filter((r: any) => r.nature === 'INCOME')
          const gastos = pnl.filter((r: any) => r.nature === 'EXPENSE')
          const totalIng = ingresos.reduce((a: number, r: any) => a + Number(r.balance || 0), 0)
          const totalGas = gastos.reduce((a: number, r: any) => a + Number(r.balance || 0), 0)
          const resultado = totalIng - totalGas
          const cuadra =
            Math.abs(Number(ledgerData.reports?.totals?.debit || 0) - Number(ledgerData.reports?.totals?.credit || 0)) < 0.01

          const columna = (titulo, filas, total, color) => (
            <div style={{padding:16,border:'1px solid var(--border)',borderRadius:12,background:'var(--surface-card)'}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:'var(--text-primary)'}}>{titulo}</div>
              {filas.length === 0 ? (
                <div style={{fontSize:12.5,color:'var(--text-muted)'}}>Nada registrado todavía.</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:7}}>
                  {filas.map((r: any) => (
                    <div key={r.code} style={{display:'flex',justifyContent:'space-between',gap:10,fontSize:13}}>
                      <span style={{color:'var(--text-secondary)',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</span>
                      <span style={{fontWeight:600,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{fmtMoney(r.balance)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:'flex',justifyContent:'space-between',gap:10,marginTop:12,paddingTop:10,borderTop:'1px solid var(--border)',fontSize:14,fontWeight:700}}>
                <span>Total</span>
                <span style={{color,fontVariantNumeric:'tabular-nums'}}>{fmtMoney(total)}</span>
              </div>
            </div>
          )

          return (
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div style={{padding:'18px 20px',borderRadius:12,background: resultado >= 0 ? 'var(--green-light)' : 'var(--red-light)'}}>
                <div style={{fontSize:12,fontWeight:700,letterSpacing:'0.04em',textTransform:'uppercase',color:'var(--text-muted)'}}>
                  Resultado de {new Date().getFullYear()}
                </div>
                <div style={{fontSize:30,fontWeight:700,marginTop:4,color: resultado >= 0 ? 'var(--green)' : 'var(--red)',fontVariantNumeric:'tabular-nums'}}>
                  {fmtMoney(resultado)}
                </div>
                <div style={{fontSize:13,color:'var(--text-secondary)',marginTop:4}}>
                  {fmtMoney(totalIng)} ingresado − {fmtMoney(totalGas)} gastado
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))',gap:14}}>
                {columna('De dónde viene el dinero', ingresos, totalIng, 'var(--green)')}
                {columna('En qué se ha ido', gastos, totalGas, 'var(--red)')}
              </div>

              {ledgerData.periods.length > 0 && (
                <div style={{padding:16,border:'1px solid var(--border)',borderRadius:12}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>Meses cerrados</div>
                  <div style={{fontSize:12.5,color:'var(--text-muted)',marginBottom:12}}>
                    Cerrar un mes deja constancia de que esas cuentas ya están dadas por buenas.
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                    {[...ledgerData.periods]
                      .sort((a, b) => String(b.code).localeCompare(String(a.code)))
                      .slice(0, 14)
                      .map((per) => (
                        <button key={per.id} type="button" onClick={() => cerrarPeriodo(per, !per.isClosed)}
                          title={per.isClosed ? 'Pulsa para reabrirlo' : 'Pulsa para cerrarlo'}
                          style={{padding:'6px 12px',borderRadius:999,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,
                            border:`1px solid ${per.isClosed ? 'var(--green)' : 'var(--border)'}`,
                            background: per.isClosed ? 'var(--green-light)' : 'var(--surface-card)',
                            color: per.isClosed ? 'var(--green)' : 'var(--text-secondary)'}}>
                          {per.isClosed ? '✓ ' : ''}{per.code}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* El cuadre es lo que dice si la contabilidad es fiable: si no
                  cuadra, cualquier cifra de arriba puede estar mal. */}
              <div style={{padding:'12px 16px',borderRadius:10,border:'1px solid var(--border)',fontSize:13,display:'flex',alignItems:'center',gap:8}}>
                <span style={{color: cuadra ? 'var(--green)' : 'var(--red)',fontWeight:800}}>{cuadra ? '✓' : '✕'}</span>
                <span style={{color:'var(--text-secondary)'}}>
                  {cuadra
                    ? 'Las cuentas cuadran: cada movimiento tiene su contrapartida.'
                    : 'Las cuentas NO cuadran. Avisa al soporte antes de dar por buenas estas cifras.'}
                </span>
              </div>
            </div>
          )
        })()}
      </div>
      )}

      {/* Table card: Facturación reciente */}
      {contaTab === 'COBROS' && (
      <div style={{background:'var(--surface-card)',borderRadius:12,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)',overflow:'hidden'}}>
        <div style={{padding:'24px 32px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <div>
            <div style={{fontWeight:600,fontSize:18,color:'var(--text-primary)',letterSpacing:'-0.01em'}}>Últimas facturas</div>
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
        <div style={{padding:'14px 32px 0',display:'flex',gap:4,background:'var(--surface-card)',alignItems:'center',flexWrap:'wrap'}}>
          <input
            type="search"
            value={buscarCobro}
            onChange={(e) => setBuscarCobro(e.target.value)}
            placeholder="Buscar por socio, concepto o nº de factura…"
            aria-label="Buscar entre las facturas"
            style={{flex:'1 1 240px',minWidth:200,order:-1,marginRight:8,padding:'8px 14px',borderRadius:999,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'var(--text-primary)',background:'var(--surface-card)'}}
          />
          {tabs.map(t => (
            <button key={t} type="button" onClick={()=>setTab(t)} style={{
              padding:'8px 16px',borderRadius:8,border:'none',cursor:'pointer',
              background:tab===t?'var(--accent-pill)':'transparent',
              color:tab===t?'var(--accent)':'var(--text-muted)',
              fontFamily:'inherit',fontSize:12,fontWeight:700,letterSpacing:'0.02em'
            }}>{t}</button>
          ))}
        </div>
        <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          {facturasSel.size > 0 && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:'12px 32px',background:'var(--accent-pill)',borderTop:'1px solid var(--border)'}}>
              <span style={{fontSize:13,fontWeight:700,color:'var(--accent)'}}>
                {facturasSel.size} factura{facturasSel.size === 1 ? '' : 's'} · {fmtMoney(filtered.filter((c) => facturasSel.has(c.id)).reduce((a, c) => a + Number(c.pendingAmount ?? c.monto ?? 0), 0))} pendiente{facturasSel.size === 1 ? '' : 's'}
              </span>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button type="button" disabled={loteBusy} onClick={() => cobrarSeleccionadas('CASH')}
                  style={{padding:'7px 14px',borderRadius:8,border:'none',background:'var(--green)',color:'#fff',cursor:loteBusy?'wait':'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700}}>
                  {loteBusy ? 'Registrando…' : 'Cobrado en efectivo'}
                </button>
                <button type="button" disabled={loteBusy} onClick={() => cobrarSeleccionadas('BANK_TRANSFER')}
                  style={{padding:'7px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-primary)',cursor:loteBusy?'wait':'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700}}>
                  Cobrado por transferencia
                </button>
                <button type="button" disabled={loteBusy} onClick={() => setFacturasSel(new Set())}
                  style={{padding:'7px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-secondary)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                  Quitar selección
                </button>
              </div>
            </div>
          )}
          <table style={{width:'100%',minWidth:640,borderCollapse:'collapse',marginTop:8}}>
            <thead>
              <tr style={{background:'var(--surface-low)'}}>
                <th style={{padding:'12px 0 12px 24px',width:36}}>
                  <input
                    type="checkbox"
                    aria-label="Marcar todas las facturas de esta página"
                    checked={filtered.length > 0 && filtered.every((c) => facturasSel.has(c.id))}
                    onChange={(e) => {
                      const marcar = e.target.checked
                      setFacturasSel((prev) => {
                        const next = new Set(prev)
                        for (const c of filtered) { if (marcar) next.add(c.id); else next.delete(c.id) }
                        return next
                      })
                    }}
                    style={{cursor:'pointer'}}
                  />
                </th>
                {['Nº','Socio','Concepto','Importe','Vencimiento','Estado',''].map(h => (
                  <th key={h} style={{padding:'12px 32px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facturasLoading && filtered.length === 0 && (
                <tr><td colSpan={8} style={{padding:'32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>Cargando facturas…</td></tr>
              )}
              {facturasError && (
                <tr><td colSpan={8} style={{padding:'32px',textAlign:'center',fontSize:14}}>
                  <div style={{color:'var(--red)',fontWeight:600,marginBottom:10}}>{facturasError}</div>
                  <button type="button" onClick={() => { void cargarFacturas(facturasPage, buscarCobro.trim(), tab, fechaDesde, fechaHasta) }}
                    style={{padding:'8px 16px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700}}>
                    Reintentar
                  </button>
                </td></tr>
              )}
              {!facturasLoading && !facturasError && filtered.length === 0 && (
                <tr><td colSpan={8} style={{padding:'32px',textAlign:'center',color:'var(--text-muted)',fontSize:14,lineHeight:1.5}}>
                  {facturasData.total === 0 && !buscado && tab === 'Todos' && !fechaDesde && !fechaHasta
                    ? 'Todavía no has emitido ninguna factura. Créala con «Nueva factura», o emite las cuotas del periodo desde Contabilidad → Suscripciones.'
                    : buscado
                      ? `Ninguna factura coincide con «${buscado}»${tab !== 'Todos' ? ` dentro de «${tab}»` : ''}.`
                      : fechaDesde || fechaHasta
                        ? 'No hay ninguna factura entre esas dos fechas. Prueba a ampliar el rango o pulsa «Limpiar».'
                        : `No hay facturas en estado «${tab}».`}
                </td></tr>
              )}
              {filtered.map((c, i) => (
                <tr key={c.id} style={{borderTop:'1px solid var(--border)',background: facturasSel.has(c.id) ? 'var(--accent-pill)' : 'transparent'}}>
                  <td style={{padding:'16px 0 16px 24px'}}>
                    <input
                      type="checkbox"
                      aria-label={`Marcar la factura ${c.numero || ''} de ${c.socio}`}
                      checked={facturasSel.has(c.id)}
                      onChange={() => alternarFactura(c.id)}
                      style={{cursor:'pointer'}}
                    />
                  </td>
                  <td style={{padding:'16px 24px',fontSize:12,fontWeight:600,color:'var(--text-muted)',whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{c.numero || '—'}</td>
                  <td style={{padding:'16px 32px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <Avatar initials={c.socio.split(' ').map(w=>w[0]).join('').slice(0,2)} color="var(--accent-soft)" size={36}/>
                      <span style={{fontWeight:600,fontSize:14,color:'var(--text-primary)'}}>{c.socio}</span>
                    </div>
                  </td>
                  <td style={{padding:'16px 32px',fontSize:13,color:'var(--text-secondary)'}}>{c.concepto}</td>
                  <td style={{padding:'16px 32px'}}>
                    <div style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>{fmtMoney(c.monto)}</div>
                  {Number(c.pendingAmount ?? c.monto) < Number(c.monto) && Number(c.pendingAmount ?? 0) > 0 && (
                    <div style={{fontSize:11,color:'var(--accent)',marginTop:3,fontWeight:600}}>
                      Faltan {fmtMoney(Number(c.pendingAmount))}
                    </div>
                  )}
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
          {facturasData.totalPages > 1 && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'14px 32px',borderTop:'1px solid var(--border)'}}>
              <span style={{fontSize:13,color:'var(--text-muted)'}}>
                Página {facturasData.page} de {facturasData.totalPages} · {facturasData.total} facturas
              </span>
              <div style={{display:'flex',gap:8}}>
                <button type="button" disabled={facturasPage <= 1 || facturasLoading}
                  onClick={() => setFacturasPage((p) => Math.max(1, p - 1))}
                  style={{padding:'7px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-primary)',cursor:facturasPage<=1?'not-allowed':'pointer',opacity:facturasPage<=1?0.5:1,fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                  Anterior
                </button>
                <button type="button" disabled={facturasPage >= facturasData.totalPages || facturasLoading}
                  onClick={() => setFacturasPage((p) => Math.min(facturasData.totalPages, p + 1))}
                  style={{padding:'7px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-primary)',cursor:facturasPage>=facturasData.totalPages?'not-allowed':'pointer',opacity:facturasPage>=facturasData.totalPages?0.5:1,fontFamily:'inherit',fontSize:12,fontWeight:600}}>
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {contaTab === 'COBROS' && menuCobroId && (
        <ViewportMenu
          data-cobro-menu
          anchor={menuCobroPos}
          style={{
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
                  <>
                    <button
                      type="button"
                      onClick={() => { setMenuCobroId(null); abrirCobro(cobroActivo) }}
                      style={{width:'100%',textAlign:'left',padding:'10px 12px',border:'none',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,color:'var(--green)',fontWeight:600}}
                    >
                      Registrar cobro…
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMenuCobroId(null); abrirEdicion(cobroActivo) }}
                      style={{width:'100%',textAlign:'left',padding:'10px 12px',border:'none',borderTop:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,color:'#44403c',fontWeight:500}}
                    >
                      Corregir factura…
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={downloadingCobroId === cobroActivo.id}
                  onClick={async () => { setMenuCobroId(null); await abrirFactura(cobroActivo) }}
                  style={{width:'100%',textAlign:'left',padding:'10px 12px',border:'none',borderTop:'1px solid var(--border)',background:'#fff',cursor:downloadingCobroId === cobroActivo.id ? 'not-allowed' : 'pointer',fontFamily:'inherit',fontSize:13,color:'#44403c',fontWeight:500,opacity:downloadingCobroId === cobroActivo.id ? 0.65 : 1}}
                >
                  {downloadingCobroId === cobroActivo.id ? 'Descargando…' : 'Descargar PDF'}
                </button>
                <button
                  type="button"
                  onClick={async () => { setMenuCobroId(null); await copiarIdCobro(cobroActivo) }}
                  style={{width:'100%',textAlign:'left',padding:'10px 12px',border:'none',borderTop:'1px solid var(--border)',background:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:13,color:'#44403c',fontWeight:500}}
                >
                  Copiar nº de factura
                </button>
                <button
                  type="button"
                  disabled={deletingCobroId === cobroActivo.id}
                  onClick={async () => { setMenuCobroId(null); await eliminarCobro(cobroActivo) }}
                  style={{width:'100%',textAlign:'left',padding:'10px 12px',border:'none',borderTop:'1px solid var(--border)',background:'#fff',cursor:deletingCobroId === cobroActivo.id ? 'not-allowed' : 'pointer',fontFamily:'inherit',fontSize:13,color:'var(--red)',fontWeight:600,opacity:deletingCobroId === cobroActivo.id ? 0.65 : 1}}
                >
                  {deletingCobroId === cobroActivo.id ? 'Eliminando…' : 'Eliminar factura'}
                </button>
              </>
            )
          })()}
        </ViewportMenu>
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
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1c1917' }}>
                {movimientoType === 'INCOME' ? 'Crear ingreso (PGC)' : 'Crear gasto (PGC)'}
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8c857d' }}>
                Se registra simultáneamente en Diario y en movimientos económicos.
              </p>
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>Concepto</label>
            <input
              value={movimientoForm.concept}
              onChange={(e) => setMovimientoForm((f) => ({ ...f, concept: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', marginBottom: 12, fontFamily: 'inherit' }}
              placeholder={movimientoType === 'INCOME' ? 'Ej. Patrocinio local' : 'Ej. Compra material deportivo'}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>Importe (€)</label>
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
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>Fecha contable</label>
                <input
                  type="date"
                  value={movimientoForm.entryDate}
                  onChange={(e) => setMovimientoForm((f) => ({ ...f, entryDate: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10 }}>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#57534e'}}>
                <input
                  type="checkbox"
                  checked={Boolean(movimientoForm.applyTax)}
                  onChange={(e) => setMovimientoForm((f) => ({ ...f, applyTax: e.target.checked }))}
                />
                Aplicar IVA
              </label>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>IVA %</label>
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
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#57534e'}}>
                <input
                  type="checkbox"
                  checked={Boolean(movimientoForm.applyWithholding)}
                  onChange={(e) => setMovimientoForm((f) => ({ ...f, applyWithholding: e.target.checked }))}
                />
                Aplicar retención
              </label>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>Retención %</label>
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
            <div style={{marginTop:10,fontSize:12,color:'#57534e'}}>
              Total movimiento (tesorería neta): {fmtMoney(
                Number(movimientoForm.amount || 0) *
                  (1 + (Boolean(movimientoForm.applyTax) ? Number(movimientoForm.taxRate || 0) / 100 : 0)) -
                  Number(movimientoForm.amount || 0) *
                    (Boolean(movimientoForm.applyWithholding) ? Number(movimientoForm.withholdingRate || 0) / 100 : 0)
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>Cuenta tesorería (57/56)</label>
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
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>
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

            <MemberCombobox
              label="Socio (opcional, trazabilidad)"
              value={movimientoForm.memberId}
              onChange={(memberId) => setMovimientoForm((f) => ({ ...f, memberId }))}
              placeholder="Buscar socio (opcional)…"
              style={{ marginTop: 12 }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                disabled={movimientoBusy}
                onClick={() => setShowMovimientoModal(false)}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.09)', background: '#fff', cursor: movimientoBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#44403c' }}
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
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1c1917' }}>Nueva factura</h3>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8c857d' }}>
                Crea un cobro manual sin salir de esta vista.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                disabled={!sociosTotal}
                onClick={() => setNuevoCobroForm((f) => ({ ...f, target: 'member' }))}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: nuevoCobroForm.target === 'member' ? '1.5px solid var(--accent)' : '1px solid rgba(0,0,0,0.09)',
                  background: nuevoCobroForm.target === 'member' ? 'var(--accent-soft)' : '#fff',
                  color: nuevoCobroForm.target === 'member' ? 'var(--accent)' : '#44403c',
                  cursor: sociosTotal ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: sociosTotal ? 1 : 0.55,
                }}
              >
                Un socio
              </button>
              <button
                type="button"
                disabled={!equiposConJugadores.length}
                onClick={() =>
                  setNuevoCobroForm((f) => ({
                    ...f,
                    target: 'team',
                    groupId: f.groupId || equiposConJugadores[0]?.id || '',
                  }))
                }
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: nuevoCobroForm.target === 'team' ? '1.5px solid var(--accent)' : '1px solid rgba(0,0,0,0.09)',
                  background: nuevoCobroForm.target === 'team' ? 'var(--accent-soft)' : '#fff',
                  color: nuevoCobroForm.target === 'team' ? 'var(--accent)' : '#44403c',
                  cursor: equiposConJugadores.length ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: equiposConJugadores.length ? 1 : 0.55,
                }}
              >
                Un equipo
              </button>
            </div>

            {nuevoCobroForm.target === 'member' ? (
              <MemberCombobox
                label="Socio"
                required
                value={nuevoCobroForm.memberId}
                onChange={(memberId) => setNuevoCobroForm((f) => ({ ...f, memberId }))}
                placeholder="Buscar socio por nombre o email…"
                style={{ marginBottom: 12 }}
              />
            ) : (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>Equipo</label>
                <select
                  required
                  value={nuevoCobroForm.groupId}
                  onChange={(e) => setNuevoCobroForm((f) => ({ ...f, groupId: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', marginBottom: 6, fontFamily: 'inherit' }}
                >
                  <option value="">— Seleccionar equipo —</option>
                  {equiposConJugadores.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.nombre} ({countTeamPlayers(eq)} jugadores)
                    </option>
                  ))}
                </select>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#78716c' }}>
                  Se crearán {countTeamPlayers(EQUIPOS_UI.find((eq) => eq.id === nuevoCobroForm.groupId) || {})} cobros (solo jugadores).
                </p>
              </>
            )}

            <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>Concepto</label>
            <input
              value={nuevoCobroForm.concepto}
              onChange={(e) => setNuevoCobroForm((f) => ({ ...f, concepto: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', marginBottom: 12, fontFamily: 'inherit' }}
              placeholder="Ej. Cuota mensual"
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>Importe (€)</label>
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
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>Vencimiento</label>
                <input
                  type="date"
                  value={nuevoCobroForm.dueDate}
                  onChange={(e) => setNuevoCobroForm((f) => ({ ...f, dueDate: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.09)', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10 }}>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#57534e'}}>
                <input
                  type="checkbox"
                  checked={Boolean(nuevoCobroForm.applyTax)}
                  onChange={(e) => setNuevoCobroForm((f) => ({ ...f, applyTax: e.target.checked }))}
                />
                Aplicar IVA
              </label>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>IVA %</label>
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
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#57534e'}}>
                <input
                  type="checkbox"
                  checked={Boolean(nuevoCobroForm.applyWithholding)}
                  onChange={(e) => setNuevoCobroForm((f) => ({ ...f, applyWithholding: e.target.checked }))}
                />
                Aplicar retención
              </label>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#78716c', marginBottom: 6, display: 'block' }}>Retención %</label>
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
            <div style={{marginTop:10,fontSize:12,color:'#57534e'}}>
              {(() => {
                const netPerMember =
                  Number(nuevoCobroForm.amount || 0) *
                    (1 + (Boolean(nuevoCobroForm.applyTax) ? Number(nuevoCobroForm.taxRate || 0) / 100 : 0)) -
                  Number(nuevoCobroForm.amount || 0) *
                    (Boolean(nuevoCobroForm.applyWithholding) ? Number(nuevoCobroForm.withholdingRate || 0) / 100 : 0)
                const teamPlayerCount =
                  nuevoCobroForm.target === 'team'
                    ? countTeamPlayers(EQUIPOS_UI.find((eq) => eq.id === nuevoCobroForm.groupId) || {})
                    : 0
                return (
                  <>
                    <div>Total cobro neto por socio: {fmtMoney(netPerMember)}</div>
                    {nuevoCobroForm.target === 'team' && teamPlayerCount > 0 && (
                      <div style={{ marginTop: 4 }}>
                        Total equipo ({teamPlayerCount} × importe neto): {fmtMoney(netPerMember * teamPlayerCount)}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                disabled={nuevoCobroBusy}
                onClick={() => setShowNuevoCobroModal(false)}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.09)', background: '#fff', cursor: nuevoCobroBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#44403c' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={nuevoCobroBusy}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none', background: 'var(--accent)', cursor: nuevoCobroBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#fff', opacity: nuevoCobroBusy ? 0.75 : 1 }}
              >
                {nuevoCobroBusy
                  ? 'Creando…'
                  : nuevoCobroForm.target === 'team'
                    ? `Crear ${countTeamPlayers(EQUIPOS_UI.find((eq) => eq.id === nuevoCobroForm.groupId) || {}) || 0} cobros`
                    : 'Crear factura'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Registrar cobro: importe, forma de pago y referencia. Antes «Marcar
          pagado» daba por cobrado TODO el pendiente, en efectivo y con fecha de
          hoy, sin preguntar nada. */}
      {/* Corregir una factura emitida y aún no cobrada: una errata obligaba a
          eliminarla y reemitirla con otro número, dejando un hueco en la
          numeración de un documento contable. */}
      {editarModal && (
        <div
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditarModal(null) }}
          style={{position:'fixed',inset:0,zIndex:1200,background:'rgba(15,23,42,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="editar-titulo"
            style={{width:'100%',maxWidth:460,background:'#fff',borderRadius:14,padding:24,boxShadow:'0 24px 50px rgba(15,23,42,0.24)'}}>
            <h3 id="editar-titulo" style={{margin:'0 0 4px',fontSize:19,fontWeight:800,color:'#1c1917'}}>
              Corregir la factura {editarModal.numero}
            </h3>
            <p style={{margin:'0 0 18px',fontSize:13,color:'#57534e'}}>
              {editarModal.socio}
              {editarModal.cobrado && ' · ya tiene cobros: solo puedes cambiar la fecha'}
            </p>

            <label style={{display:'block',fontSize:12,fontWeight:700,color:'#57534e',marginBottom:6}}>Concepto</label>
            <input
              value={editarModal.concepto}
              disabled={editarModal.cobrado}
              onChange={(e) => setEditarModal((m) => ({ ...m, concepto: e.target.value }))}
              style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:14,boxSizing:'border-box',marginBottom:14,background:editarModal.cobrado?'#f5f5f4':'#fff'}}
            />

            <label style={{display:'block',fontSize:12,fontWeight:700,color:'#57534e',marginBottom:6}}>
              {editarModal.llevaImpuestos ? 'Base imponible' : 'Importe'}
            </label>
            <input
              type="number" step="0.01" min="0.01"
              value={editarModal.importe}
              disabled={editarModal.cobrado}
              onChange={(e) => setEditarModal((m) => ({ ...m, importe: e.target.value }))}
              style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:14,boxSizing:'border-box',marginBottom:editarModal.llevaImpuestos?4:14,background:editarModal.cobrado?'#f5f5f4':'#fff'}}
            />
            {editarModal.llevaImpuestos ? (
              <div style={{fontSize:11.5,color:'var(--text-muted)',marginBottom:14}}>
                Los impuestos se recalculan con los mismos tipos que ya tiene esta factura.
              </div>
            ) : null}

            <label style={{display:'block',fontSize:12,fontWeight:700,color:'#57534e',marginBottom:6}}>Vencimiento</label>
            <input
              type="date"
              value={editarModal.vencimiento}
              onChange={(e) => setEditarModal((m) => ({ ...m, vencimiento: e.target.value }))}
              style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:14,boxSizing:'border-box',marginBottom:14}}
            />

            <p style={{fontSize:12,color:'#78716c',lineHeight:1.5,margin:'0 0 18px'}}>
              El número de factura no cambia. Si ya le habías pasado el enlace de pago al socio,
              se generará uno nuevo con el importe corregido.
            </p>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button type="button" disabled={editarBusy} onClick={() => setEditarModal(null)}
                style={{padding:'10px 16px',borderRadius:10,border:'1px solid var(--border)',background:'#fff',color:'#57534e',cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
                Cancelar
              </button>
              <button type="button" disabled={editarBusy} onClick={guardarEdicion}
                style={{padding:'10px 16px',borderRadius:10,border:'none',background:'var(--accent)',color:'#fff',cursor:editarBusy?'wait':'pointer',fontFamily:'inherit',fontWeight:700}}>
                {editarBusy ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cobroModal && (
        <div
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setCobroModal(null) }}
          style={{position:'fixed',inset:0,zIndex:1200,background:'rgba(15,23,42,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="cobro-titulo"
            style={{width:'100%',maxWidth:440,background:'#fff',borderRadius:14,padding:24,boxShadow:'0 24px 50px rgba(15,23,42,0.24)'}}>
            <h3 id="cobro-titulo" style={{margin:'0 0 4px',fontSize:19,fontWeight:800,color:'#1c1917'}}>
              Registrar cobro
            </h3>
            <p style={{margin:'0 0 18px',fontSize:13,color:'#57534e'}}>
              {cobroModal.numero} · {cobroModal.socio} · debe {fmtMoney(cobroModal.pendiente)}
            </p>

            <label style={{display:'block',fontSize:12,fontWeight:700,color:'#57534e',marginBottom:6}}>
              Importe cobrado
            </label>
            <input
              type="number" step="0.01" min="0.01" max={cobroModal.pendiente}
              value={cobroModal.importe}
              onChange={(e) => setCobroModal((m) => ({ ...m, importe: e.target.value }))}
              style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:14,boxSizing:'border-box',marginBottom:14}}
            />

            <label style={{display:'block',fontSize:12,fontWeight:700,color:'#57534e',marginBottom:6}}>
              ¿Cómo ha pagado?
            </label>
            <select
              value={cobroModal.metodo}
              onChange={(e) => setCobroModal((m) => ({ ...m, metodo: e.target.value }))}
              style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:14,boxSizing:'border-box',marginBottom:14,cursor:'pointer'}}
            >
              <option value="CASH">Efectivo</option>
              <option value="BANK_TRANSFER">Transferencia</option>
            </select>

            {cobroModal.metodo === 'BANK_TRANSFER' && (
              <>
                <label style={{display:'block',fontSize:12,fontWeight:700,color:'#57534e',marginBottom:6}}>
                  Referencia del banco (opcional)
                </label>
                <input
                  value={cobroModal.referencia}
                  onChange={(e) => setCobroModal((m) => ({ ...m, referencia: e.target.value }))}
                  placeholder="Para poder cuadrarlo con el extracto"
                  style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:14,boxSizing:'border-box',marginBottom:14}}
                />
              </>
            )}

            <p style={{fontSize:12,color:'#78716c',lineHeight:1.5,margin:'0 0 18px'}}>
              Se creará el apunte contable correspondiente.
            </p>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button type="button" disabled={cobroBusy} onClick={() => setCobroModal(null)}
                style={{padding:'10px 16px',borderRadius:10,border:'1px solid var(--border)',background:'#fff',color:'#57534e',cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
                Cancelar
              </button>
              <button type="button" disabled={cobroBusy} onClick={registrarCobro}
                style={{padding:'10px 16px',borderRadius:10,border:'none',background:'var(--accent)',color:'#fff',cursor:cobroBusy?'wait':'pointer',fontFamily:'inherit',fontWeight:700}}>
                {cobroBusy ? 'Registrando…' : 'Registrar cobro'}
              </button>
            </div>
          </div>
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
  const [showEventoModal, setShowEventoModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [eventoBusy, setEventoBusy] = useState(false);
  const [formEvento, setFormEvento] = useState({
    groupId: '',
    teamIds: [],
    title: '',
    type: 'OTHER',
    datetimeLocal: '',
    location: '',
    description: '',
    scheduleAttendance: false,
    scheduleAttendanceDays: 7,
  });
  const FESTIVOS_UI = bundle?.festivos ?? [];
  const [festivoForm, setFestivoForm] = useState({ date: '', name: '' });
  const [festivoBusy, setFestivoBusy] = useState(false);

  async function anadirFestivo() {
    if (!festivoForm.date.trim()) {
      showAlert('Indica la fecha del festivo.');
      return;
    }
    setFestivoBusy(true);
    try {
      const r = await fetch('/api/crm/club-holidays', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: festivoForm.date,
          name: festivoForm.name.trim() || undefined,
        }),
      });
      if (!r.ok) {
        try {
          showAlert((await r.json()).error || 'Error al guardar festivo');
        } catch {
          showAlert('Error al guardar festivo');
        }
        return;
      }
      setFestivoForm({ date: '', name: '' });
      await reload();
    } finally {
      setFestivoBusy(false);
    }
  }

  async function quitarFestivo(id) {
    setFestivoBusy(true);
    try {
      const r = await fetch('/api/crm/club-holidays/' + id, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) {
        showAlert('No se pudo quitar el festivo');
        return;
      }
      await reload();
    } finally {
      setFestivoBusy(false);
    }
  }

  const evInput = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 12,
    border: '1px solid rgba(0,0,0,0.09)',
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    color: '#1c1917',
    outline: 'none',
    boxSizing: 'border-box',
  }
  const evLabel = {
    fontSize: 12,
    fontWeight: 600,
    color: '#78716c',
    marginBottom: 6,
    display: 'block',
    letterSpacing: 0.15,
  }

  async function openNuevoEventoModal() {
    let grupos = EQUIPOS_UI
    if (!grupos.length) {
      // El bundle puede estar desactualizado (grupo recién creado en otra
      // pestaña/sesión): re-consulta antes de mandar al usuario al organigrama.
      const fresh = await reload().catch(() => null)
      grupos = fresh?.equipos ?? []
    }
    if (!grupos.length) {
      showAlert('Crea antes un grupo (pestaña Organigrama).')
      setActive('organigrama')
      return
    }
    setEditingEventId(null)
    setFormEvento({
      groupId: grupos[0].id,
      teamIds: [grupos[0].id],
      title: '',
      type: 'OTHER',
      datetimeLocal: datetimeLocalValue(),
      location: '',
      description: '',
      scheduleAttendance: false,
      scheduleAttendanceDays: 7,
    })
    setShowEventoModal(true)
  }

  function openEditEventoModal(ev) {
    setEditingEventId(ev.id)
    // Reconstruye el datetime-local desde el INSTANTE real (dateIso) en la zona del
    // cliente, para que al guardar (new Date(datetimeLocal), también en cliente) se
    // conserve el mismo instante y la hora no se desplace en cada edición. Fallback
    // al formato antiguo fecha+hora si el bundle aún no trae dateIso.
    let datetimeLocal: string
    const inst = ev.dateIso ? new Date(ev.dateIso) : null
    if (inst && !Number.isNaN(inst.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0')
      datetimeLocal = `${inst.getFullYear()}-${pad(inst.getMonth() + 1)}-${pad(inst.getDate())}T${pad(inst.getHours())}:${pad(inst.getMinutes())}`
    } else {
      const [hh = '00', mm = '00'] = String(ev.hora || '').split(':')
      datetimeLocal = `${ev.fecha}T${hh}:${mm}`
    }
    setFormEvento({
      groupId: ev.groupId || EQUIPOS_UI[0]?.id || '',
      teamIds: [ev.groupId || EQUIPOS_UI[0]?.id || ''],
      title: ev.titulo || '',
      type: ev.typeCode || 'OTHER',
      datetimeLocal,
      location: ev.location || '',
      description: ev.description || '',
      scheduleAttendance: false,
      scheduleAttendanceDays: 7,
    })
    setShowEventoModal(true)
  }

  async function enviarEvento(e) {
    e.preventDefault()
    const isEdit = Boolean(editingEventId)
    const title = String(formEvento.title || '').trim()
    const groupId = String(formEvento.groupId || '').trim()
    const teamIds = (formEvento.teamIds || []).filter(Boolean)
    if (!title) return
    if (isEdit ? !groupId : teamIds.length === 0) {
      showAlert('Selecciona al menos un equipo.')
      return
    }
    const d = new Date(formEvento.datetimeLocal)
    if (Number.isNaN(d.getTime())) {
      showAlert('Fecha u hora no válida.')
      return
    }
    setEventoBusy(true)
    try {
      const r = await fetch(isEdit ? `/api/crm/events/${editingEventId}` : '/api/crm/events', {
        method: isEdit ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          ...(isEdit ? { groupId } : { teamIds }),
          type: formEvento.type,
          date: d.toISOString(),
          location: formEvento.location.trim() || undefined,
          description: formEvento.description.trim() || undefined,
          ...(isEdit ? {} : {
            scheduleAttendanceForm: formEvento.scheduleAttendance,
            ...(formEvento.scheduleAttendance ? { attendanceReminderDays: formEvento.scheduleAttendanceDays } : {}),
          }),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        showAlert(j.error || (isEdit ? 'No se pudo actualizar el evento' : 'No se pudo crear el evento'))
        return
      }
      track('guardar-evento', { editar: isEdit, tipo: formEvento.type })
      setShowEventoModal(false)
      setEditingEventId(null)
      // Resumen del formulario de asistencia programado (lo envía el cron).
      const att = j.attendance
      if (att) {
        const equipos = `Evento creado en ${j.created} equipo(s).`
        const sendAtMs = att.sendAt ? new Date(att.sendAt).getTime() : NaN
        if (Number.isFinite(sendAtMs) && sendAtMs <= Date.now()) {
          showAlert(`${equipos}\n\nFormulario de asistencia programado: se enviará en breve.`)
        } else {
          const fecha = att.sendAt
            ? new Date(att.sendAt).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
            : ''
          showAlert(`${equipos}\n\nFormulario de asistencia programado: se enviará el ${fecha} (${att.reminderDays} días antes del evento).`)
        }
      } else if (!isEdit && (j.created ?? 0) > 1) {
        showAlert(`Evento creado en ${j.created} equipos.`)
      }
      await reload()
    } finally {
      setEventoBusy(false)
    }
  }
  const year = viewYm.year, month = viewYm.month;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const tipoColors = {Torneo:'#3B82F6',Entrenamiento:'#10B981',Partido:'#F59E0B',Reunión:'#8B5CF6',Competencia:'#EF4444',Especial:'#06B6D4', 'Otro': '#78716c'};

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
            <h1 style={{fontSize:28,fontWeight:700,color:'var(--text-primary)',letterSpacing:'-0.02em',margin:0,lineHeight:1.1}}>Calendario</h1>
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

        {/* Festivos del club (WD-2) */}
        <div style={{background:'var(--surface-card)',borderRadius:12,padding:24,boxShadow:'var(--card-shadow)',border:'1px solid var(--border)'}}>
          <div style={{fontWeight:600,fontSize:16,color:'var(--text-primary)',marginBottom:4}}>Festivos del club</div>
          <p style={{fontSize:13,color:'var(--text-muted)',margin:'0 0 16px 0'}}>
            Días sin entrenamiento al generar el calendario automático (WD-2).
          </p>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14,maxHeight:160,overflowY:'auto'}}>
            {FESTIVOS_UI.length === 0 && (
              <div style={{fontSize:13,color:'var(--text-muted)'}}>Sin festivos registrados.</div>
            )}
            {FESTIVOS_UI.map((f) => (
              <div key={f.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'10px 12px',borderRadius:10,border:'1px solid var(--border)',background:'var(--surface-low)'}}>
                <div style={{fontSize:13,color:'var(--text-primary)'}}>
                  <strong>{f.date}</strong>
                  {f.name ? ` · ${f.name}` : ''}
                </div>
                <button type="button" disabled={festivoBusy} onClick={() => quitarFestivo(f.id)} style={{padding:'6px 10px',borderRadius:8,border:'1px solid #fecaca',background:'#fff',color:'#b91c1c',cursor:festivoBusy?'not-allowed':'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600}}>Quitar</button>
              </div>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',gap:10,alignItems:'end'}}>
            <div>
              <label style={evLabel}>Fecha</label>
              <input type="date" value={festivoForm.date} onChange={(e) => setFestivoForm((p) => ({ ...p, date: e.target.value }))} style={evInput} disabled={festivoBusy} />
            </div>
            <div>
              <label style={evLabel}>Nombre (opcional)</label>
              <input value={festivoForm.name} onChange={(e) => setFestivoForm((p) => ({ ...p, name: e.target.value }))} style={evInput} placeholder="Ej. Navidad" disabled={festivoBusy} />
            </div>
            <button type="button" disabled={festivoBusy} onClick={anadirFestivo} style={{padding:'11px 16px',borderRadius:12,border:'none',background:'var(--accent)',color:'#fff',cursor:festivoBusy?'not-allowed':'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700}}>Añadir festivo</button>
          </div>
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
                      <div
                        key={e.id}
                        role="button"
                        tabIndex={0}
                        title={e.titulo}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          openEditEventoModal(e)
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault()
                            ev.stopPropagation()
                            openEditEventoModal(e)
                          }
                        }}
                        style={{
                        fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:4,marginBottom:2,
                        background:`${tc}20`,color:tc,
                        whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                        cursor:'pointer',
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
                  <div
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openEditEventoModal(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault()
                        openEditEventoModal(e)
                      }
                    }}
                    style={{
                    padding:14,borderRadius:10,
                    background:'var(--surface-low)',
                    borderLeft:`3px solid ${tc}`,
                    cursor:'pointer',
                    transition:'background 0.15s',
                  }}
                    onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--surface-card)' }}
                    onMouseLeave={(ev) => { ev.currentTarget.style.background = 'var(--surface-low)' }}
                  >
                    <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>{e.titulo}</div>
                    <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:2}}>{new Date(e.fecha).toLocaleDateString('es-ES')} · {e.hora}</div>
                    {e.lugar && e.lugar !== '—' && <div style={{fontSize:12,color:'var(--text-muted)'}}>{e.lugar}</div>}
                    <div style={{display:'flex',gap:6,marginTop:8,flexWrap:'wrap',alignItems:'center'}}>
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
                      <span style={{marginLeft:'auto',fontSize:11,fontWeight:600,color:'var(--accent)'}}>Editar</span>
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
      {showEventoModal && (
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
            if (e.target !== e.currentTarget || eventoBusy) return;
            setShowEventoModal(false);
            setEditingEventId(null);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="evento-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={enviarEvento}
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
                <h2 id="evento-modal-title" style={{ margin: '0 0 6px 0', fontSize: 20, fontWeight: 800, color: '#1c1917', letterSpacing: '-0.4px' }}>
                  {editingEventId ? 'Editar evento' : 'Nuevo evento'}
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: '#8c857d', lineHeight: 1.5 }}>
                  {editingEventId
                    ? 'Modifica equipo, tipo, fecha u hora. Los cambios se reflejan en el calendario.'
                    : 'Elige equipo, tipo y fecha. Aparecerá en el calendario del club.'}
                </p>
              </div>
              <button
                type="button"
                disabled={eventoBusy}
                onClick={() => {
                  setShowEventoModal(false)
                  setEditingEventId(null)
                }}
                style={{
                  border: 'none',
                  background: '#f4efe8',
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  cursor: eventoBusy ? 'not-allowed' : 'pointer',
                  color: '#78716c',
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
              {editingEventId ? (
                <div>
                  <label style={evLabel}>Equipo *</label>
                  <select
                    required
                    value={formEvento.groupId}
                    onChange={(e) => setFormEvento((p) => ({ ...p, groupId: e.target.value }))}
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
              ) : (
                <div>
                  <label style={evLabel}>Grupos * <span style={{ fontWeight: 400, textTransform: 'none' }}>(el evento se crea en todos los marcados)</span></label>
                  <div style={{
                    border: '1px solid rgba(0,0,0,0.09)', borderRadius: 12, background: '#fff',
                    maxHeight: 150, overflowY: 'auto', padding: '6px 4px',
                  }}>
                    {EQUIPOS_UI.map((eq) => {
                      const checked = formEvento.teamIds.includes(eq.id)
                      return (
                        <label key={eq.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                          borderRadius: 8, cursor: 'pointer', fontSize: 14, color: '#1c1917',
                          background: checked ? 'var(--accent-pill)' : 'transparent',
                        }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setFormEvento((p) => ({
                                ...p,
                                teamIds: checked
                                  ? p.teamIds.filter((id) => id !== eq.id)
                                  : [...p.teamIds, eq.id],
                              }))
                            }
                          />
                          <span>
                            {eq.nombre}
                            {eq.categoria && eq.categoria !== '—' ? ` (${eq.categoria})` : ''}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
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
              <div>
                <label style={evLabel}>Información (opcional)</label>
                <textarea
                  value={formEvento.description}
                  onChange={(e) => setFormEvento((p) => ({ ...p, description: e.target.value }))}
                  style={{ ...evInput, minHeight: 76, resize: 'vertical' }}
                  placeholder="Notas para el equipo: qué llevar, indicaciones, etc."
                />
              </div>
              {!editingEventId && (
                <>
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
                  borderRadius: 12, border: '1px solid rgba(0,0,0,0.09)', background: 'var(--surface-low)',
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={formEvento.scheduleAttendance}
                    onChange={(e) => setFormEvento((p) => ({ ...p, scheduleAttendance: e.target.checked }))}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#1c1917' }}>
                      Programar formulario de asistencia
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: '#78716c', marginTop: 2, lineHeight: 1.5 }}>
                      Envía por WhatsApp a cada miembro del equipo su enlace personal para confirmar asistencia.
                      Si el miembro es menor de edad, el enlace va a su familiar/tutor asignado.
                    </span>
                  </span>
                </label>
                {formEvento.scheduleAttendance && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '0 4px' }}>
                    <span style={{ fontSize: 13, color: '#57534e', fontWeight: 600 }}>Enviar con</span>
                    <select
                      value={formEvento.scheduleAttendanceDays}
                      onChange={(e) => setFormEvento((p) => ({ ...p, scheduleAttendanceDays: Number(e.target.value) }))}
                      style={{ ...evInput, width: 'auto', padding: '8px 12px' }}
                    >
                      {[1, 3, 7, 15, 30].map((d) => (
                        <option key={d} value={d}>{d} {d === 1 ? 'día' : 'días'}</option>
                      ))}
                    </select>
                    <span style={{ fontSize: 13, color: '#57534e' }}>de antelación</span>
                  </div>
                )}
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 26 }}>
              <button
                type="button"
                disabled={eventoBusy}
                onClick={() => {
                  setShowEventoModal(false)
                  setEditingEventId(null)
                }}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: '1.5px solid rgba(0,0,0,0.09)',
                  background: '#fff',
                  cursor: eventoBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#44403c',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={eventoBusy}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--accent)',
                  cursor: eventoBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  opacity: eventoBusy ? 0.75 : 1,
                }}
              >
                {eventoBusy
                  ? (editingEventId ? 'Guardando…' : 'Creando…')
                  : (editingEventId ? 'Guardar cambios' : 'Crear evento')}
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
/** Primer y último día del año en curso, en formato de <input type="date">. */
function rangoAnioActual() {
  const y = new Date().getFullYear()
  return { desde: `${y}-01-01`, hasta: `${y}-12-31`, anio: y }
}

function Informes({ setActive }) {
  const { bundle, fmtMoney } = useCrm();
  const role = normalizeRole(bundle?.user?.role)
  if (!(role === 'ADMIN' || role === 'TREASURER')) return null
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  // Arrancar sin rango sumaba TODOS los años en el mismo gráfico y en los KPI:
  // enero de 2025 y enero de 2026 caían en la misma barra.
  const [fechaDesde, setFechaDesde] = useState(() => rangoAnioActual().desde);
  const [fechaHasta, setFechaHasta] = useState(() => rangoAnioActual().hasta);
  const [morososPage, setMorososPage] = useState(1);
  const [morososList, setMorososList] = useState<any[]>([]);
  const [morososTotal, setMorososTotal] = useState(0);
  const [morososTotalPages, setMorososTotalPages] = useState(1);
  const [morososLoading, setMorososLoading] = useState(false);
  const morososCount = Number(bundle?.kpis?.sociosMorosos || morososTotal || 0);

  useEffect(() => {
    setMorososLoading(true);
    fetch(`/api/crm/members?estado=Moroso&page=${morososPage}&pageSize=25`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : { socios: [], total: 0, totalPages: 1 }))
      .then((j) => {
        setMorososList(Array.isArray(j?.socios) ? j.socios : []);
        setMorososTotal(Number(j?.total || 0));
        setMorososTotalPages(Math.max(1, Number(j?.totalPages || 1)));
      })
      .catch(() => {
        setMorososList([]);
        setMorososTotal(0);
        setMorososTotalPages(1);
      })
      .finally(() => setMorososLoading(false));
  }, [morososPage]);

  const reportTx = bundle?.reportTransactions ?? [];
  const txFiltradas = reportTx.filter((t) => {
    const d = String(t.date || '');
    if (fechaDesde && d < fechaDesde) return false;
    if (fechaHasta && d > fechaHasta) return false;
    return true;
  });
  const ingresos = Array(12).fill(0);
  const egresos = Array(12).fill(0);
  // El gráfico es de doce meses de UN año. Si el rango abarca varios, se toma el
  // del inicio: mezclar años en la misma barra daba cifras que no existen.
  const anioGrafico = Number((fechaDesde || fechaHasta || '').slice(0, 4)) || new Date().getFullYear();
  for (const t of txFiltradas) {
    const dt = new Date(String(t.date || ''));
    if (Number.isNaN(dt.getTime())) continue;
    if (dt.getFullYear() !== anioGrafico) continue;
    const m = dt.getMonth();
    if (m < 0 || m > 11) continue;
    if (t.type === 'INCOME') ingresos[m] += Number(t.amount || 0);
    if (t.type === 'EXPENSE') egresos[m] += Number(t.amount || 0);
  }
  const totIng = ingresos.reduce((a,b)=>a+b,0);
  const totEgr = egresos.reduce((a,b)=>a+b,0);
  const conceptTotals = new Map();
  for (const t of txFiltradas) {
    if (t.type !== 'INCOME') continue;
    let label = 'Otros';
    if (t.invoiceKind === 'MEMBERSHIP') label = 'Cuotas mensuales';
    else if (t.invoiceKind === 'OTHER') label = 'Cobros adicionales';
    // Histórico: las filas antiguas se etiquetaron con la pasarela anterior.
    else if (t.source === 'STRIPE' || t.source === 'WHOP') label = 'Cobros online';
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
    : [{ label: 'Sin ingresos', value: 0, color: '#d8cdbd' }];

  const ratio = totIng > 0 ? Math.round(((totIng - totEgr) / totIng) * 100) : 0

  return (
    <div style={{flex:1,overflowY:'auto',background:'var(--surface)'}}>
      <div style={{maxWidth:1440,margin:'0 auto',padding:'32px 40px 56px',display:'flex',flexDirection:'column',gap:32}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:24,flexWrap:'wrap'}}>
          <div>
            <h1 style={{fontSize:28,fontWeight:700,color:'var(--text-primary)',letterSpacing:'-0.02em',margin:0,lineHeight:1.1}}>Informes</h1>
            <p style={{color:'var(--text-secondary)',fontSize:14,marginTop:6,margin:0}}>Resumen financiero y operacional del club</p>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} style={{padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'var(--text-primary)',background:'var(--surface-card)'}}/>
            <span style={{fontSize:12,color:'var(--text-muted)'}}>—</span>
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} style={{padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,color:'var(--text-primary)',background:'var(--surface-card)'}}/>
            <button type="button" onClick={() => { setFechaDesde(''); setFechaHasta(''); }} style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,color:'var(--text-secondary)'}}>Limpiar</button>
            <button type="button" onClick={() => {
              const q = new URLSearchParams()
              if (fechaDesde) q.set('from', fechaDesde)
              if (fechaHasta) q.set('to', fechaHasta)
              const qs = q.toString()
              window.location.href = '/api/billing/reports/invoices-csv' + (qs ? `?${qs}` : '')
            }} style={{
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
          <KPICard label="Socios morosos" value={String(morososCount)} sub={morososCount > 0 ? 'Deuda vencida' : 'Sin morosidad'} icon="users" color="var(--amber)" badge={morososCount > 0 ? { kind:'warning', text:'Atención' } : { kind:'success', text:'OK' }}/>
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
            <div style={{fontSize:13,color:'var(--text-muted)',marginTop:4}}>
              {morososLoading
                ? 'Cargando…'
                : `${morososTotal.toLocaleString('es-ES')} ${morososTotal === 1 ? 'socio' : 'socios'} en mora`}
            </div>
          </div>
          {morososLoading ? (
            <div style={{padding:'32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>Cargando socios morosos…</div>
          ) : morososList.length === 0 ? (
            <div style={{padding:'32px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>
              Sin morosidad. Todos los socios al día.
            </div>
          ) : (
            <>
            {morososList.map((s, i) => (
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
                  {/* Lo que DEBE, no lo que paga al mes: con tres recibos
                      atrasados la cifra anterior mostraba un tercio. */}
                  <div style={{fontWeight:700,fontSize:14,color:'var(--red)'}}>{fmtMoney(s.deudaTotal ?? s.cuota)}</div>
                  {Number(s.recibosPendientes || 0) > 1 && (
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                      {s.recibosPendientes} recibos
                    </div>
                  )}
                </div>
                <Badge status="Moroso"/>
                <button type="button" onClick={() => setActive('socios')} style={{padding:'7px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,transition:'all 0.15s'}}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-pill)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-card)' }}
                >Ver en socios</button>
              </div>
            ))}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'16px 32px', borderTop:'1px solid var(--border)' }}>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>Página {morososPage} de {morososTotalPages}</span>
              <div style={{ display:'flex', gap:8 }}>
                <button type="button" disabled={morososPage <= 1 || morososLoading} onClick={() => setMorososPage((p) => Math.max(1, p - 1))} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-card)', cursor: morososPage <= 1 ? 'not-allowed' : 'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, opacity: morososPage <= 1 ? 0.5 : 1 }}>Anterior</button>
                <button type="button" disabled={morososPage >= morososTotalPages || morososLoading} onClick={() => setMorososPage((p) => Math.min(morososTotalPages, p + 1))} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-card)', cursor: morososPage >= morososTotalPages ? 'not-allowed' : 'pointer', fontFamily:'inherit', fontSize:12, fontWeight:600, opacity: morososPage >= morososTotalPages ? 0.5 : 1 }}>Siguiente</button>
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Cuotas() {
  const { bundle, reload, fmtMoney, showAlert, showConfirm } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  if (!(role === 'ADMIN' || role === 'TREASURER')) return null
  return (
    <CuotasSection
      bundle={bundle}
      reload={reload}
      fmtMoney={fmtMoney}
      showAlert={showAlert}
      showConfirm={showConfirm}
    />
  )
}

function Banco() {
  const { bundle, showAlert } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  if (!(role === 'ADMIN' || role === 'TREASURER')) return null
  return (
    <SectionShell
      title="Banco"
      subtitle="Tu dinero: lo cobrado, a qué cuenta llega y cuándo te lo transferimos"
    >
      <BancoSection
        showAlert={showAlert}
        countryHint={String(bundle?.club?.country || 'España')}
        whopConectado={
          bundle?.club?.whopConectado === null || bundle?.club?.whopConectado === undefined
            ? bundle?.club?.whopConectado ?? null
            : Boolean(bundle.club.whopConectado)
        }
        esAdmin={role === 'ADMIN'}
        // Configurar la pasarela sigue siendo cosa del ADMIN, en Ajustes.
        onConfigurarPasarela={
          role === 'ADMIN'
            ? () => window.dispatchEvent(new CustomEvent('crm-abrir-ajustes-club'))
            : undefined
        }
      />
    </SectionShell>
  )
}

function Workflows() {
  const { bundle, reload } = useCrm();
  const role = normalizeRole(bundle?.user?.role)
  if (role !== 'ADMIN') return null
  return <WorkflowsSection bundle={bundle} reload={reload} />;
}

function Entrenamiento() {
  const { bundle, showAlert, showConfirm } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  if (!(role === 'ADMIN' || role === 'COACH')) return null
  return <EntrenamientoSection showAlert={showAlert} showConfirm={showConfirm} />
}

function Personal() {
  const { bundle, reload, showAlert, showConfirm } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  if (role !== 'ADMIN') return null
  const users = (bundle?.users as any[]) ?? []
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
    const ok = await showConfirm('¿Restablecer la contraseña de esta cuenta a la contraseña por defecto?')
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
        showAlert(j.error || 'No se pudo restablecer la contraseña')
        return
      }
      showAlert(`Contraseña restablecida. Nueva contraseña: ${defaultPassword}`)
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
          <KPICard label="Administradores" value={String(numAdmins)} sub="Acceso completo" icon="users" color="var(--accent)" badge={{ kind: 'info', text: 'Acceso total' }}/>
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
            <MemberCombobox
              value={form.memberId}
              onChange={(memberId) => setForm((p) => ({ ...p, memberId }))}
              placeholder="Vincular socio (opcional)…"
              style={{ marginBottom: 16 }}
            />
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
                        <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
                        <option value="COACH">{ROLE_LABEL.COACH}</option>
                        <option value="TREASURER">{ROLE_LABEL.TREASURER}</option>
                        <option value="MEMBER">{ROLE_LABEL.MEMBER}</option>
                      </select>
                    </td>
                    <td style={{ padding: '16px 32px', color: 'var(--text-secondary)' }}>{u.memberName || '—'}</td>
                    <td style={{ padding: '16px 32px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {u.isEnvFixedAdmin ? (
                        '—'
                      ) : (
                        <>
                          <button type="button" onClick={() => resetPassword(u.id)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-card)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Restablecer contraseña</button>
                          <button type="button" onClick={() => removeUser(u.id, u.name || u.email || u.id)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--red)', background: 'var(--surface-card)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>Eliminar</button>
                        </>
                      )}
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

// ── CHAT (roadmap · Módulo 3): lista ┃ conversación ┃ panel de info ─────────
function chatInitials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function chatTimeLabel(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hm = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  return sameDay ? hm : `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} ${hm}`
}

function ChatSection() {
  const { bundle, showAlert } = useCrm()
  const role = normalizeRole(bundle?.user?.role)
  if (role !== 'ADMIN') return null

  const [view, setView] = useState('chat') // 'chat' | 'session'
  const [threads, setThreads] = useState([])
  const [groups, setGroups] = useState([]) // organigrama aplanado
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [memberResults, setMemberResults] = useState([])
  const [sel, setSel] = useState(null) // { kind: 'member'|'group', id, name }
  const [messages, setMessages] = useState([])
  const [info, setInfo] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)

  const loadThreads = useCallback(async () => {
    try {
      const r = await fetch('/api/crm/chat/threads', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      setThreads(Array.isArray(j.threads) ? j.threads : [])
    } catch { /* noop */ }
  }, [])

  const loadGroups = useCallback(async () => {
    try {
      const r = await fetch('/api/crm/groups', { credentials: 'include', cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      const out = []
      const walk = (nodes, depth) => {
        for (const n of nodes || []) {
          out.push({ id: n.id, name: n.name, depth, directMemberCount: n.directMemberCount })
          walk(n.children, depth + 1)
        }
      }
      walk(j.tree, 0)
      setGroups(out)
    } catch { /* noop */ }
  }, [])

  useEffect(() => { void loadThreads(); void loadGroups() }, [loadThreads, loadGroups])

  // Buscador con debounce (socios vía API lite + grupos en cliente)
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => {
    if (!searchDebounced) { setMemberResults([]); return }
    let cancelled = false
    ;(async () => {
      try {
        const params = new URLSearchParams({ lite: '1', page: '1', pageSize: '8', q: searchDebounced })
        const r = await fetch(`/api/crm/members?${params.toString()}`, { credentials: 'include', cache: 'no-store' })
        if (!r.ok || cancelled) return
        const j = await r.json()
        if (!cancelled) setMemberResults(Array.isArray(j.socios) ? j.socios : [])
      } catch { /* noop */ }
    })()
    return () => { cancelled = true }
  }, [searchDebounced])

  const groupMatches = searchDebounced
    ? groups.filter((g) => g.name.toLowerCase().includes(searchDebounced.toLowerCase())).slice(0, 6)
    : []

  const loadMessages = useCallback(async (thread) => {
    if (!thread) { setMessages([]); return }
    const key = thread.kind === 'group' ? `groupId=${thread.id}` : `memberId=${thread.id}`
    try {
      const r = await fetch(`/api/crm/chat/messages?${key}`, { credentials: 'include', cache: 'no-store' })
      if (!r.ok) { setMessages([]); return }
      const j = await r.json()
      setMessages(Array.isArray(j.messages) ? j.messages : [])
    } catch { setMessages([]) }
  }, [])

  const loadInfo = useCallback(async (thread) => {
    setInfo(null)
    if (!thread) return
    try {
      if (thread.kind === 'member') {
        const r = await fetch(`/api/crm/members?id=${encodeURIComponent(thread.id)}`, { credentials: 'include', cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (j?.socio) setInfo({ kind: 'member', socio: j.socio })
      } else {
        const r = await fetch(`/api/crm/groups/${thread.id}/members`, { credentials: 'include', cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        setInfo({ kind: 'group', members: j.members || [] })
      }
    } catch { /* noop */ }
  }, [])

  useEffect(() => { void loadMessages(sel); void loadInfo(sel) }, [sel, loadMessages, loadInfo])
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight })
  }, [messages])

  function openThread(kind, id, name) {
    setSel({ kind, id, name })
    setSearch('')
    setMemberResults([])
  }

  async function sendDraft(e) {
    e?.preventDefault?.()
    const message = draft.trim()
    if (!sel || !message || sending) return
    setSending(true)
    try {
      const r = await fetch('/api/crm/chat/messages', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [sel.kind === 'group' ? 'groupId' : 'memberId']: sel.id, message }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { showAlert(j.error || 'No se pudo enviar el mensaje'); return }
      setDraft('')
      await Promise.all([loadMessages(sel), loadThreads()])
      if (sel.kind === 'group' && ((j.skippedNoPhone ?? 0) > 0 || (j.failed ?? 0) > 0)) {
        showAlert(`Enviado a ${j.sent}/${j.total} miembros.${j.skippedNoPhone ? ` ${j.skippedNoPhone} sin teléfono.` : ''}${j.failed ? ` ${j.failed} fallidos.` : ''}`)
      }
    } finally { setSending(false) }
  }

  const STATUS_HINT = { FAILED: 'No entregado', PARTIAL: 'Entrega parcial' }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,height:'100%',overflow:'hidden',background:'var(--surface)'}}>
      {/* Barra superior de la sección */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,padding:'20px 28px 16px',flexShrink:0}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700,color:'var(--text-primary)',letterSpacing:'-0.02em',margin:0}}>Chat</h1>
          <p style={{margin:'2px 0 0',fontSize:13,color:'var(--text-secondary)'}}>Conversaciones de WhatsApp con socios y grupos</p>
        </div>
        <button
          type="button"
          onClick={() => setView(view === 'chat' ? 'session' : 'chat')}
          style={{display:'flex',alignItems:'center',gap:8,padding:'9px 16px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-card)',color:'var(--text-primary)',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:600}}
        >
          <Icon name="whatsapp" size={15}/>
          {view === 'chat' ? 'Conexión y sesión' : 'Volver al chat'}
        </button>
      </div>

      {view === 'session' ? (
        <div style={{flex:1,minHeight:0,display:'flex',overflow:'hidden'}}>
          <WhatsAppSection/>
        </div>
      ) : (
        <div style={{flex:1,minHeight:0,display:'flex',gap:0,margin:'0 28px 24px',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden',background:'var(--surface-card)',boxShadow:'var(--card-shadow)'}}>
          {/* ── Panel izquierdo: buscador + conversaciones ── */}
          <div style={{width:300,flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',minHeight:0}}>
            <div style={{padding:14,borderBottom:'1px solid var(--border)'}}>
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}>
                  <Icon name="search" size={15}/>
                </span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar socio o grupo…"
                  style={{width:'100%',padding:'9px 12px 9px 36px',borderRadius:10,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:13,background:'var(--surface-low)',outline:'none',boxSizing:'border-box'}}
                />
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',minHeight:0}}>
              {searchDebounced ? (
                <>
                  {memberResults.length > 0 && (
                    <div style={{padding:'10px 14px 4px',fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Socios</div>
                  )}
                  {memberResults.map((s) => (
                    <button key={s.id} type="button" onClick={() => openThread('member', s.id, s.nombre)}
                      style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 14px',border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                      <Avatar initials={s.avatar || chatInitials(s.nombre)} color="#2563eb" size={34}/>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.nombre}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.email || 'Socio'}</div>
                      </div>
                    </button>
                  ))}
                  {groupMatches.length > 0 && (
                    <div style={{padding:'10px 14px 4px',fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Grupos</div>
                  )}
                  {groupMatches.map((g) => (
                    <button key={g.id} type="button" onClick={() => openThread('group', g.id, g.name)}
                      style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 14px',border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                      <div style={{width:34,height:34,borderRadius:'50%',background:'var(--green-soft)',color:'var(--green)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <Icon name="teams" size={16}/>
                      </div>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{g.name}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>Grupo · difusión a sus miembros</div>
                      </div>
                    </button>
                  ))}
                  {memberResults.length === 0 && groupMatches.length === 0 && (
                    <p style={{padding:'18px 14px',fontSize:13,color:'var(--text-muted)'}}>Sin resultados para «{searchDebounced}».</p>
                  )}
                </>
              ) : (
                <>
                  {threads.length === 0 && (
                    <p style={{padding:'18px 14px',fontSize:13,color:'var(--text-muted)',lineHeight:1.6}}>
                      Aún no hay conversaciones.<br/>Busca un socio o un grupo arriba para empezar a chatear.
                    </p>
                  )}
                  {threads.map((t) => {
                    const isSel = sel && sel.kind === t.kind && sel.id === t.id
                    return (
                      <button key={`${t.kind}:${t.id}`} type="button" onClick={() => openThread(t.kind, t.id, t.name)}
                        style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'11px 14px',border:'none',cursor:'pointer',fontFamily:'inherit',textAlign:'left',background:isSel ? 'var(--accent-pill)' : 'transparent',borderLeft:isSel ? '3px solid var(--accent)' : '3px solid transparent'}}>
                        {t.kind === 'group' ? (
                          <div style={{width:38,height:38,borderRadius:'50%',background:'var(--green-soft)',color:'var(--green)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                            <Icon name="teams" size={17}/>
                          </div>
                        ) : (
                          <Avatar initials={chatInitials(t.name)} color="#2563eb" size={38}/>
                        )}
                        <div style={{minWidth:0,flex:1}}>
                          <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'baseline'}}>
                            <span style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</span>
                            <span style={{fontSize:10,color:'var(--text-muted)',flexShrink:0}}>{chatTimeLabel(t.lastAt)}</span>
                          </div>
                          <div style={{fontSize:12,color:t.lastStatus === 'FAILED' ? 'var(--red)' : 'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1}}>
                            {t.lastMessage}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          {/* ── Panel central: conversación ── */}
          <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column',minHeight:0,background:'var(--surface)'}}>
            {!sel ? (
              <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,color:'var(--text-muted)'}}>
                <Icon name="whatsapp" size={40}/>
                <p style={{fontSize:14,margin:0}}>Elige una conversación o busca a alguien para empezar.</p>
              </div>
            ) : (
              <>
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 18px',borderBottom:'1px solid var(--border)',background:'var(--surface-card)',flexShrink:0}}>
                  {sel.kind === 'group' ? (
                    <div style={{width:36,height:36,borderRadius:'50%',background:'var(--green-soft)',color:'var(--green)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <Icon name="teams" size={16}/>
                    </div>
                  ) : (
                    <Avatar initials={chatInitials(sel.name)} color="#2563eb" size={36}/>
                  )}
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>{sel.name}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>
                      {sel.kind === 'group' ? 'Chat de grupo · el mensaje llega a todos sus miembros' : 'Conversación por WhatsApp'}
                    </div>
                  </div>
                </div>
                <div ref={scrollRef} style={{flex:1,overflowY:'auto',minHeight:0,padding:'18px 22px',display:'flex',flexDirection:'column',gap:10}}>
                  {messages.length === 0 && (
                    <p style={{fontSize:13,color:'var(--text-muted)',textAlign:'center',margin:'auto 0'}}>
                      Sin mensajes todavía. Escribe abajo para enviar el primero.
                    </p>
                  )}
                  {messages.map((m) => {
                    const isOut = m.direction !== 'IN'
                    return (
                      <div key={m.id} style={{display:'flex',justifyContent:isOut ? 'flex-end' : 'flex-start'}}>
                        <div style={{
                          maxWidth:'72%',padding:'9px 13px',borderRadius:14,
                          borderBottomRightRadius:isOut ? 4 : 14,borderBottomLeftRadius:isOut ? 14 : 4,
                          background:isOut ? 'var(--accent)' : 'var(--surface-card)',
                          color:isOut ? '#fff' : 'var(--text-primary)',
                          border:isOut ? 'none' : '1px solid var(--border)',
                          boxShadow:'var(--card-shadow)',
                        }}>
                          <div style={{fontSize:13.5,lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{m.body}</div>
                          <div style={{display:'flex',gap:6,justifyContent:'flex-end',alignItems:'center',marginTop:3}}>
                            {STATUS_HINT[m.status] && (
                              <span style={{fontSize:10,fontWeight:700,color:isOut ? 'rgba(255,255,255,0.85)' : 'var(--red)'}} title={m.error || ''}>
                                ⚠ {STATUS_HINT[m.status]}
                              </span>
                            )}
                            <span style={{fontSize:10,color:isOut ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)'}}>{chatTimeLabel(m.at)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <form onSubmit={sendDraft} style={{display:'flex',gap:10,padding:'12px 18px',borderTop:'1px solid var(--border)',background:'var(--surface-card)',flexShrink:0}}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={sel.kind === 'group' ? `Mensaje para todo «${sel.name}»…` : `Mensaje para ${sel.name}…`}
                    style={{flex:1,padding:'11px 14px',borderRadius:999,border:'1px solid var(--border)',fontFamily:'inherit',fontSize:14,background:'var(--surface-low)',outline:'none'}}
                  />
                  <button type="submit" disabled={sending || !draft.trim()}
                    style={{padding:'11px 20px',borderRadius:999,border:'none',background:'var(--accent)',color:'#fff',cursor:sending||!draft.trim()?'not-allowed':'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,opacity:sending||!draft.trim()?0.6:1}}>
                    {sending ? 'Enviando…' : 'Enviar'}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* ── Panel derecho: información del contacto / grupo ── */}
          {sel && (
            <div style={{width:280,flexShrink:0,borderLeft:'1px solid var(--border)',overflowY:'auto',minHeight:0,padding:20,display:'flex',flexDirection:'column',gap:16,background:'var(--surface-card)'}}>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,paddingBottom:14,borderBottom:'1px solid var(--border)'}}>
                {sel.kind === 'group' ? (
                  <div style={{width:64,height:64,borderRadius:'50%',background:'var(--green-soft)',color:'var(--green)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <Icon name="teams" size={28}/>
                  </div>
                ) : (
                  <Avatar initials={chatInitials(sel.name)} color="#2563eb" size={64}/>
                )}
                <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',textAlign:'center'}}>{sel.name}</div>
                {sel.kind === 'member' && info?.socio && <Badge status={info.socio.estado}/>}
              </div>
              {sel.kind === 'member' && info?.socio && (
                <div style={{display:'flex',flexDirection:'column',gap:0}}>
                  {[
                    ['Teléfono', info.socio.telefono || '—'],
                    ['Email', info.socio.email || '—'],
                    ['Equipo', info.socio.equipoNombre || '—'],
                    ['Cuota', info.socio.membershipPlanName || '—'],
                    ['Alta', info.socio.fechaAlta ? new Date(info.socio.fechaAlta).toLocaleDateString('es-ES') : '—'],
                  ].map(([k, v]) => (
                    <div key={k} style={{display:'flex',justifyContent:'space-between',gap:10,padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:12,color:'var(--text-muted)'}}>{k}</span>
                      <span style={{fontSize:12.5,fontWeight:600,color:'var(--text-primary)',textAlign:'right',overflow:'hidden',textOverflow:'ellipsis'}}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {sel.kind === 'group' && (
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>
                    Miembros ({info?.members?.length ?? '…'})
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {(info?.members ?? []).slice(0, 12).map((m) => (
                      <div key={m.memberId} style={{display:'flex',alignItems:'center',gap:8}}>
                        <Avatar initials={chatInitials(m.name)} color="#2563eb" size={26}/>
                        <span style={{fontSize:12.5,color:'var(--text-primary)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.name}</span>
                        {m.inherited && <span style={{fontSize:9,fontWeight:700,color:'var(--text-muted)'}}>SUBGRUPO</span>}
                      </div>
                    ))}
                    {(info?.members?.length ?? 0) > 12 && (
                      <span style={{fontSize:11,color:'var(--text-muted)'}}>y {info.members.length - 12} más…</span>
                    )}
                  </div>
                </div>
              )}
              <p style={{margin:'auto 0 0',fontSize:11,color:'var(--text-muted)',lineHeight:1.5}}>
                El historial muestra los mensajes enviados desde el CRM. Las respuestas del socio llegan a tu WhatsApp conectado.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
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
      // El id REAL de la sesión (con el prefijo que añade ApiWass, p.ej. "93_x")
      // manda siempre: solo hay una sesión por club. Si se usara el id preferido
      // (el que se teclea al crear, sin prefijo), Eliminar/Reiniciar fallarían.
      const next = one?.id || preferredSessionId || activeSessionId || ''
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
            <h1 style={{fontSize:28,fontWeight:700,color:'var(--text-primary)',letterSpacing:'-0.02em',margin:0,lineHeight:1.1}}>Conexión de WhatsApp</h1>
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
            <textarea value={sendMessage} onChange={(e)=>setSendMessage(e.target.value)} rows={4} placeholder="Hola, este mensaje sale desde ProClubCRM." style={{...inputStyle,marginBottom:14,resize:'vertical'}} />
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
// Mantener sincronizado con CrmSectionId (src/lib/rbac.ts).
const CRM_SECTION_IDS = [
  'dashboard','socios','cuotas','contabilidad','calendario','informes','workflows','whatsapp','hermes','personal',
  'entrenamiento',
  // Roadmap: Admin · Contabilidad · Configuración
  'admin-sumario','organigrama','contactos','asistencia',
  'facturas','banco','impagos','productos','descuentos',
  'forms','api',
] as const;
type SectionId = (typeof CRM_SECTION_IDS)[number]

const SECTION_TITLES: Record<SectionId, string> = {
  dashboard: 'Inicio',
  socios: 'Socios',
  cuotas: 'Gestión de cuotas',
  contabilidad: 'Contabilidad',
  banco: 'Banco',
  calendario: 'Calendario',
  informes: 'Informes',
  workflows: 'Flujos',
  whatsapp: 'WhatsApp',
  hermes: 'Hermes Agent',
  personal: 'Personal',
  entrenamiento: 'Entrenamiento',
  'admin-sumario': 'Sumario',
  organigrama: 'Organigrama',
  contactos: 'Contactos',
  asistencia: 'Asistencia',
  facturas: 'Facturas',
  impagos: 'Impagos',
  productos: 'Productos',
  descuentos: 'Descuentos',
  forms: 'Forms',
  api: 'API',
}

function CrmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { loading, error, bundle } = useCrm()
  const [showNotifications, setShowNotifications] = useState(false)
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([])
  const [showClubSettings, setShowClubSettings] = useState(false)
  const [showMiCuenta, setShowMiCuenta] = useState(false)
  /** Cajón del menú en móvil. En escritorio el CSS lo ignora. */
  const [menuAbierto, setMenuAbierto] = useState(false)

  // Banco puede pedir abrir los Ajustes del club (para conectar la pasarela).
  // Va por evento porque el modal lo controla la raíz y la sección está varios
  // niveles por debajo.
  useEffect(() => {
    function abrir() { setShowClubSettings(true) }
    window.addEventListener('crm-abrir-ajustes-club', abrir)
    return () => window.removeEventListener('crm-abrir-ajustes-club', abrir)
  }, [])
  useEffect(() => {
    if (!menuAbierto) return
    function onKey(e) { if (e.key === 'Escape') setMenuAbierto(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuAbierto])

  const tabRaw = searchParams.get('tab') ?? ''
  const normalizedTab = tabRaw === 'cobros' ? 'facturas' : tabRaw
  // Debe declararse antes de cualquier hook que liste `role` en dependencias
  // (evita ReferenceError: Cannot access ... before initialization en SSR/client).
  const role = normalizeRole(bundle?.user?.role)
  // Sección accesible = permitida por rol Y con su módulo activado en el plan.
  const canShow = (id) => canAccessCrmSection(role, id) && isSectionEnabled(id, bundle?.features)

  const active: SectionId = CRM_SECTION_IDS.includes(normalizedTab as SectionId)
    ? (normalizedTab as SectionId)
    : 'dashboard'
  const firstAllowed = (CRM_SECTION_IDS.find((id) => canShow(id)) || 'dashboard') as SectionId
  const safeActive = canShow(active) ? active : firstAllowed

  useEffect(() => {
    if (loading || !bundle?.user?.role) return

    const tRaw = searchParams.get('tab')
    const t = tRaw === 'cobros' ? 'facturas' : tRaw
    if (!t || !CRM_SECTION_IDS.includes(t as SectionId)) {
      router.replace(`/?tab=${firstAllowed}`, { scroll: false })
      return
    }
    if (!canShow(t as SectionId)) {
      router.replace(`/?tab=${firstAllowed}`, { scroll: false })
      return
    }
    if (tRaw === 'cobros') {
      router.replace('/?tab=facturas', { scroll: false })
    }
  }, [router, searchParams, role, firstAllowed, loading, bundle?.user?.role])

  const features = bundle?.features
  const setActive = useCallback(
    (id: string) => {
      if (!CRM_SECTION_IDS.includes(id as SectionId)) return
      if (!canAccessCrmSection(role, id as SectionId)) return
      if (!isSectionEnabled(id, features)) return
      router.replace(`/?tab=${encodeURIComponent(id)}`, { scroll: false })
    },
    [router, role, features]
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
          tab: 'impagos',
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
      const cobroNombre = cobros.find((c) => c?.memberId === memberId)?.socio
      out.push({
        id: `member-overdue-${memberId}`,
        title: 'Socio con mensualidad impagada',
        description: `${cobroNombre || 'Socio'} · ${count} cuota(s) vencida(s)`,
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
          tab: 'facturas',
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

    // La LISTA muestra TODAS las notificaciones actuales; el estado "visto"
    // (dismissedNotificationIds) NO filtra aquí (si lo hiciera, al abrir el
    // desplegable el efecto de "marcar como visto" las borraría al instante). El
    // "visto" solo afecta al CONTADOR de no leídas de abajo.
    return out
      .sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1))
      .slice(0, 20)
  }, [bundle])

  const unreadCount = notifications.filter((n) => !dismissedNotificationIds.includes(n.id)).length

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
    cuotas: Cuotas,
    // Roadmap 6.1: el Sumario es solo consulta+exportación; la gestión completa
    // (antigua pantalla Contabilidad) vive en el submódulo Facturas.
    contabilidad: ContabilidadSumario,
    facturas: Contabilidad,
    banco: Banco,
    calendario: Calendario,
    informes: Informes,
    workflows: Workflows,
    whatsapp: ChatSection,
    hermes: HermesAgentSection,
    personal: Personal,
    entrenamiento: Entrenamiento,
    // Roadmap
    'admin-sumario': AdminSumario,
    organigrama: Organigrama,
    contactos: ContactosSection,
    asistencia: AsistenciaSection,
    impagos: Impagos,
    productos: ProductosSection,
    descuentos: DescuentosSection,
    forms: FormsConfigSection,
    api: ApiInfoSection,
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
    <div className="crm-shell" style={{display:'flex',height:'100vh',overflow:'hidden',position:'relative',background:'var(--surface)'}}>
      {/* Fondo oscuro del cajón: pulsarlo lo cierra, que es lo que espera
          cualquiera que haya usado un móvil. */}
      {menuAbierto && (
        <div
          className="crm-backdrop"
          role="presentation"
          onClick={() => setMenuAbierto(false)}
        />
      )}
      {loading && (
        <div style={{position:'absolute',inset:0,background:'rgba(248,249,255,0.85)',backdropFilter:'blur(4px)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:600,color:'var(--text-secondary)'}}>
          Cargando CRM…
        </div>
      )}
      <Sidebar
        active={safeActive}
        setActive={(id) => { setActive(id); setMenuAbierto(false) }}
        abierto={menuAbierto}
        onOpenClubSettings={role === 'ADMIN' ? () => setShowClubSettings(true) : undefined}
        onOpenMiCuenta={() => { setShowMiCuenta(true); setMenuAbierto(false) }}
      />
      <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',minWidth:0,background:'var(--surface)'}}>
        <div className="crm-topbar" style={{
          height:72,background:'var(--surface-card)',
          borderBottom:'1px solid var(--border)',
          display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'0 40px',gap:24,flexShrink:0,
          position:'sticky',top:0,zIndex:10,
        }}>
          {/* Section title + date */}
          <div style={{display:'flex',alignItems:'center',gap:16,minWidth:0}}>
            <button
              type="button"
              className="crm-menu-boton"
              aria-label={menuAbierto ? 'Cerrar el menú' : 'Abrir el menú'}
              aria-expanded={menuAbierto}
              onClick={() => setMenuAbierto((v) => !v)}
            >
              {menuAbierto ? '✕' : '☰'}
            </button>
            <h2 style={{
              fontSize:24,fontWeight:600,letterSpacing:'-0.01em',
              color:'var(--text-primary)',margin:0,lineHeight:1.2,
              whiteSpace:'nowrap'
            }}>{SECTION_TITLES[safeActive] || 'Inicio'}</h2>
            <span className="crm-topbar-sep" style={{width:1,height:20,background:'var(--border)'}}></span>
            <span className="crm-topbar-fecha" style={{
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
                <span style={{fontSize:13,fontWeight:700,color:'#1c1917'}}>Notificaciones</span>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:12,color:'#8c857d'}}>{unreadCount}</span>
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
                <div style={{padding:'14px 12px',fontSize:13,color:'#8c857d'}}>No hay novedades ahora mismo.</div>
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
                      <span style={{width:7,height:7,borderRadius:'50%',background:n.priority === 'high' ? 'var(--red)' : '#a8a29e',flexShrink:0}}></span>
                      <span style={{fontSize:13,fontWeight:600,color:'#1c1917'}}>{n.title}</span>
                    </div>
                    <div style={{fontSize:12,color:'#8c857d',marginTop:4,paddingLeft:15}}>{n.description}</div>
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
      {/* En la raíz a propósito: la barra lateral lleva `transform` en móvil, y un
          ancestro con transform recorta cualquier hijo `position: fixed`. */}
      <MiCuentaModal
        open={showMiCuenta}
        emailActual={bundle?.user?.email || ''}
        onClose={() => setShowMiCuenta(false)}
      />
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

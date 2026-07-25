// @ts-nocheck
'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { COURT_TYPES, COURT_LABELS } from '@/lib/training'

/* ────────────────────────────────────────────────────────────────────────────
   Módulo de Entrenamiento (estilo 360Player, construido con nuestro código).
   Estética 100% CRM: estilos inline + tokens var(--...), sin Tailwind.

   Estructura: Navegador de contenido (colecciones + sesiones) → Detalle de
   sesión (timeline de bloques/ejercicios) → Editor de ejercicio con pizarra
   táctica interactiva (tipo de campo + diapositivas animadas).
──────────────────────────────────────────────────────────────────────────── */

// ── Geometría del campo (viewBox del SVG) ───────────────────────────────────
const VBW = 1000
const VBH = 640
const M = 30
const R = { x: M, y: M, w: VBW - M * 2, h: VBH - M * 2 }

// ── Colores del dominio (fichas). El resto usa tokens del CRM. ───────────────
const TOKEN_COLOR = {
  playerA: 'var(--red)',
  playerB: 'var(--accent)',
  ball: '#f5b301',
  cone: '#ea7317',
  label: 'var(--surface-high)',
}
const KIND_LABEL = {
  playerA: 'Jugador A',
  playerB: 'Jugador B',
  ball: 'Balón',
  cone: 'Cono',
  label: 'Etiqueta',
}
const LINE = 'var(--text-muted)'
const COURT_BG = 'var(--surface-low)'

let _idc = 0
function genId(prefix) {
  _idc += 1
  return `${prefix}${Date.now().toString(36)}${_idc}`
}

// ── Estilos reutilizables ────────────────────────────────────────────────────
const cardSt = {
  background: 'var(--surface-card)',
  borderRadius: 14,
  border: '1px solid var(--border)',
  boxShadow: 'var(--card-shadow)',
}
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8,
  border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
}
const btnSecondary = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface-card)', color: 'var(--text-primary)',
  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
}
const btnGhost = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
  border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)',
  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
}
const inputSt = {
  padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
  fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box', width: '100%',
  background: 'var(--surface-card)', color: 'var(--text-primary)',
}
const labelSt = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: 6, display: 'block',
}

// ── SVG: markings del campo según el tipo ────────────────────────────────────
function courtMarkings(type) {
  const { x, y, w, h } = R
  const cx = x + w / 2
  const cy = y + h / 2
  const L = (x1, y1, x2, y2, sw = 2, dash) => (
    <line key={`l${x1}-${y1}-${x2}-${y2}-${dash || ''}`} x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={LINE} strokeWidth={sw} strokeOpacity={0.6} strokeDasharray={dash || undefined} />
  )
  const out = []
  if (type === 'volleyball') {
    out.push(L(cx, y, cx, y + h, 3))
    out.push(L(cx - w / 6, y, cx - w / 6, y + h, 2, '10 8'))
    out.push(L(cx + w / 6, y, cx + w / 6, y + h, 2, '10 8'))
  } else if (type === 'football' || type === 'futsal') {
    out.push(L(cx, y, cx, y + h, 2))
    out.push(<circle key="cc" cx={cx} cy={cy} r={h * 0.16} fill="none" stroke={LINE} strokeWidth={2} strokeOpacity={0.6} />)
    out.push(<circle key="cs" cx={cx} cy={cy} r={3} fill={LINE} />)
    const pbH = h * 0.55, pbW = w * 0.13, gaH = h * 0.3, gaW = w * 0.055
    out.push(<rect key="pb1" x={x} y={cy - pbH / 2} width={pbW} height={pbH} fill="none" stroke={LINE} strokeWidth={2} strokeOpacity={0.6} />)
    out.push(<rect key="pb2" x={x + w - pbW} y={cy - pbH / 2} width={pbW} height={pbH} fill="none" stroke={LINE} strokeWidth={2} strokeOpacity={0.6} />)
    out.push(<rect key="ga1" x={x} y={cy - gaH / 2} width={gaW} height={gaH} fill="none" stroke={LINE} strokeWidth={2} strokeOpacity={0.6} />)
    out.push(<rect key="ga2" x={x + w - gaW} y={cy - gaH / 2} width={gaW} height={gaH} fill="none" stroke={LINE} strokeWidth={2} strokeOpacity={0.6} />)
  } else if (type === 'basketball') {
    out.push(L(cx, y, cx, y + h, 2))
    out.push(<circle key="cc" cx={cx} cy={cy} r={h * 0.13} fill="none" stroke={LINE} strokeWidth={2} strokeOpacity={0.6} />)
    const keyH = h * 0.36, keyW = w * 0.16
    out.push(<rect key="k1" x={x} y={cy - keyH / 2} width={keyW} height={keyH} fill="var(--accent)" fillOpacity={0.05} stroke={LINE} strokeWidth={2} strokeOpacity={0.6} />)
    out.push(<rect key="k2" x={x + w - keyW} y={cy - keyH / 2} width={keyW} height={keyH} fill="var(--accent)" fillOpacity={0.05} stroke={LINE} strokeWidth={2} strokeOpacity={0.6} />)
    out.push(<circle key="ft1" cx={x + keyW} cy={cy} r={keyH * 0.36} fill="none" stroke={LINE} strokeWidth={2} strokeOpacity={0.55} />)
    out.push(<circle key="ft2" cx={x + w - keyW} cy={cy} r={keyH * 0.36} fill="none" stroke={LINE} strokeWidth={2} strokeOpacity={0.55} />)
    const r3 = h * 0.46
    out.push(<path key="a1" d={`M ${x + 6} ${cy - r3} A ${r3} ${r3} 0 0 1 ${x + 6} ${cy + r3}`} fill="none" stroke={LINE} strokeWidth={2} strokeOpacity={0.55} />)
    out.push(<path key="a2" d={`M ${x + w - 6} ${cy - r3} A ${r3} ${r3} 0 0 0 ${x + w - 6} ${cy + r3}`} fill="none" stroke={LINE} strokeWidth={2} strokeOpacity={0.55} />)
  } else if (type === 'tennis') {
    out.push(L(cx, y - 4, cx, y + h + 4, 3, '2 7'))
    const inset = h * 0.12
    out.push(L(x, y + inset, x + w, y + inset, 2))
    out.push(L(x, y + h - inset, x + w, y + h - inset, 2))
    const sl = w * 0.22
    out.push(L(x + sl, y + inset, x + sl, y + h - inset, 2))
    out.push(L(x + w - sl, y + inset, x + w - sl, y + h - inset, 2))
    out.push(L(x + sl, cy, x + w - sl, cy, 2))
  } else if (type === 'handball') {
    out.push(L(cx, y, cx, y + h, 2))
    out.push(<circle key="cs" cx={cx} cy={cy} r={3} fill={LINE} />)
    const ga = h * 0.5
    out.push(<path key="g1" d={`M ${x} ${cy - ga / 2} A ${w * 0.16} ${ga / 2} 0 0 1 ${x} ${cy + ga / 2}`} fill="var(--accent)" fillOpacity={0.05} stroke={LINE} strokeWidth={2} strokeOpacity={0.6} />)
    out.push(<path key="g2" d={`M ${x + w} ${cy - ga / 2} A ${w * 0.16} ${ga / 2} 0 0 0 ${x + w} ${cy + ga / 2}`} fill="var(--accent)" fillOpacity={0.05} stroke={LINE} strokeWidth={2} strokeOpacity={0.6} />)
  }
  return out
}

function CourtFrame({ type, children }) {
  return (
    <>
      <rect x={R.x - 8} y={R.y - 8} width={R.w + 16} height={R.h + 16} rx={12} fill="var(--surface-mid)" />
      <rect x={R.x} y={R.y} width={R.w} height={R.h} rx={6} fill={COURT_BG} stroke={LINE} strokeOpacity={0.75} strokeWidth={3} />
      {courtMarkings(type)}
      {children}
    </>
  )
}

const toPx = (p) => ({ x: R.x + p.x * R.w, y: R.y + p.y * R.h })

// ── Miniatura de campo (solo lectura), para tarjetas ─────────────────────────
function MiniCourt({ diagram, courtType, height = 96 }) {
  const type = (diagram && diagram.courtType) || courtType || 'volleyball'
  const slide = diagram && Array.isArray(diagram.slides) ? diagram.slides[0] : null
  const tokens = diagram && Array.isArray(diagram.tokens) ? diagram.tokens : []
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height, display: 'block' }}>
      <CourtFrame type={type} />
      {slide && tokens.map((t) => {
        const p = slide.positions ? slide.positions[t.id] : null
        if (!p) return null
        const px = toPx(p)
        const isBall = t.kind === 'ball'
        return <circle key={t.id} cx={px.x} cy={px.y} r={isBall ? 14 : 22} fill={TOKEN_COLOR[t.kind] || 'var(--accent)'} />
      })}
    </svg>
  )
}

// ── Pizarra táctica interactiva ──────────────────────────────────────────────
function TacticalBoard({ initial, onChange }) {
  const svgRef = useRef(null)
  const [dg, setDg] = useState(() => normalizeDiagram(initial))
  const [cur, setCur] = useState(0)
  const [sel, setSel] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [playPos, setPlayPos] = useState(null)
  const curRef = useRef(0)
  const playingRef = useRef(false)
  const rafRef = useRef(0)

  useEffect(() => { curRef.current = cur }, [cur])
  useEffect(() => { onChange && onChange(dg) }, [dg, onChange])
  useEffect(() => () => { playingRef.current = false; if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const slide = dg.slides[Math.min(cur, dg.slides.length - 1)] || dg.slides[0]
  const selectedToken = dg.tokens.find((t) => t.id === sel)

  function setCourt(type) {
    setDg((prev) => ({ ...prev, courtType: type }))
  }
  function addToken(kind) {
    if (playing) return
    const id = genId('k')
    const label = nextLabel(dg.tokens, kind)
    const jitter = (dg.tokens.length % 6) * 0.045
    const pos = { x: 0.32 + jitter, y: 0.5 }
    setDg((prev) => ({
      ...prev,
      tokens: [...prev.tokens, { id, kind, label }],
      slides: prev.slides.map((s) => ({ ...s, positions: { ...s.positions, [id]: pos } })),
    }))
    setSel(id)
  }
  function deleteToken(id) {
    setDg((prev) => ({
      ...prev,
      tokens: prev.tokens.filter((t) => t.id !== id),
      slides: prev.slides.map((s) => {
        const positions = { ...s.positions }
        delete positions[id]
        return { ...s, positions }
      }),
    }))
    setSel((s) => (s === id ? null : s))
  }
  function renameToken(id, label) {
    setDg((prev) => ({ ...prev, tokens: prev.tokens.map((t) => (t.id === id ? { ...t, label: String(label).slice(0, 40) } : t)) }))
  }
  function addSlide() {
    if (playing) return
    setDg((prev) => {
      const src = prev.slides[Math.min(curRef.current, prev.slides.length - 1)] || prev.slides[0]
      const copy = { id: genId('s'), positions: { ...src.positions } }
      const slides = [...prev.slides]
      slides.splice(curRef.current + 1, 0, copy)
      return { ...prev, slides }
    })
    setCur((c) => c + 1)
  }
  function deleteSlide(i) {
    if (dg.slides.length <= 1) return
    const newLen = dg.slides.length - 1
    // Mantener la selección sobre la MISMA diapositiva tras el desplazamiento.
    let nc = cur
    if (i < cur) nc = cur - 1
    nc = Math.max(0, Math.min(nc, newLen - 1))
    setDg((prev) => ({ ...prev, slides: prev.slides.filter((_, idx) => idx !== i) }))
    setCur(nc)
  }

  function clientToNorm(e) {
    const svg = svgRef.current
    if (!svg) return { x: 0.5, y: 0.5 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0.5, y: 0.5 }
    const loc = pt.matrixTransform(ctm.inverse())
    return { x: (loc.x - R.x) / R.w, y: (loc.y - R.y) / R.h }
  }
  const clamp = (v) => Math.max(0, Math.min(1, v))

  function onTokenDown(e, id) {
    if (playing) return
    e.preventDefault()
    e.stopPropagation()
    setSel(id)
    const move = (ev) => {
      const n = clientToNorm(ev)
      const p = { x: clamp(n.x), y: clamp(n.y) }
      setDg((prev) => {
        const idx = Math.min(curRef.current, prev.slides.length - 1)
        const slides = prev.slides.map((s, i) => (i === idx ? { ...s, positions: { ...s.positions, [id]: p } } : s))
        return { ...prev, slides }
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function play() {
    if (playing) { stop(); return }
    if (dg.slides.length < 2) return
    playingRef.current = true
    setPlaying(true)
    let seg = 0
    let start = null
    const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
    const step = (ts) => {
      if (!playingRef.current) return
      if (start === null) start = ts
      const from = dg.slides[seg], to = dg.slides[seg + 1]
      const raw = (ts - start) / (dg.transitionMs || 900)
      const k = easeInOut(Math.min(1, raw))
      const pos = {}
      dg.tokens.forEach((t) => {
        const a = from.positions[t.id], b = to.positions[t.id]
        if (a && b) pos[t.id] = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
        else if (a && !b) { if (k < 1) pos[t.id] = a }
        else if (!a && b) { if (k >= 1) pos[t.id] = b }
      })
      setPlayPos(pos)
      if (raw >= 1) {
        seg += 1
        start = ts
        if (seg >= dg.slides.length - 1) { stop(); setCur(dg.slides.length - 1); return }
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }
  function stop() {
    playingRef.current = false
    setPlaying(false)
    setPlayPos(null)
  }

  const shown = playing && playPos ? playPos : (slide ? slide.positions : {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      {/* Barra: tipo de campo + fichas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...labelSt, margin: 0 }}>Campo</span>
          <select value={dg.courtType} onChange={(e) => setCourt(e.target.value)} disabled={playing}
            style={{ ...inputSt, width: 'auto', padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}>
            {COURT_TYPES.map((t) => <option key={t} value={t}>{COURT_LABELS[t]}</option>)}
          </select>
        </div>
        <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['playerA', 'playerB', 'ball', 'cone', 'label'].map((kind) => (
            <button key={kind} type="button" onClick={() => addToken(kind)} disabled={playing} title={`Añadir ${KIND_LABEL[kind]}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-card)', cursor: playing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              <span style={{ width: 14, height: 14, borderRadius: kind === 'cone' ? 2 : '50%', background: TOKEN_COLOR[kind], display: 'inline-block', clipPath: kind === 'cone' ? 'polygon(50% 0, 100% 100%, 0 100%)' : undefined, border: kind === 'label' ? '1px solid var(--border-strong)' : 'none' }} />
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {selectedToken && !playing && (selectedToken.kind === 'label' || selectedToken.kind === 'playerA' || selectedToken.kind === 'playerB') && (
          <input value={selectedToken.label} onChange={(e) => renameToken(sel, e.target.value)}
            placeholder={selectedToken.kind === 'label' ? 'Texto de la etiqueta' : 'Nº / dorsal'}
            style={{ ...inputSt, width: 150, padding: '7px 10px', fontSize: 13 }} />
        )}
        {sel && !playing && (
          <button type="button" onClick={() => deleteToken(sel)} style={{ ...btnGhost, color: 'var(--red)' }}>Eliminar ficha</button>
        )}
      </div>

      {/* Campo */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}>
        <svg ref={svgRef} viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', maxHeight: '52vh', display: 'block', touchAction: 'none' }}
          onPointerDown={(e) => { if (e.target === svgRef.current) setSel(null) }}>
          <CourtFrame type={dg.courtType} />
          {dg.tokens.map((t) => {
            const p = shown[t.id]
            if (!p) return null
            const px = toPx(p)
            return (
              <g key={t.id} transform={`translate(${px.x},${px.y})`} style={{ cursor: playing ? 'default' : 'grab' }}
                onPointerDown={(e) => onTokenDown(e, t.id)}>
                {sel === t.id && !playing && <circle r={30} fill="none" stroke="var(--accent)" strokeWidth={3} />}
                {t.kind === 'cone' ? (
                  <path d="M0,-20 L18,18 L-18,18 Z" fill={TOKEN_COLOR.cone} stroke="#fff" strokeWidth={2} />
                ) : t.kind === 'label' ? (
                  <>
                    <rect x={-42} y={-17} width={84} height={34} rx={9} fill={TOKEN_COLOR.label} stroke="var(--border-strong)" strokeWidth={1.5} />
                    <text textAnchor="middle" y={6} fill="var(--text-primary)" fontSize={16} fontFamily="inherit">{t.label || 'Texto'}</text>
                  </>
                ) : t.kind === 'ball' ? (
                  <>
                    <circle r={15} fill={TOKEN_COLOR.ball} stroke="#fff" strokeWidth={2} />
                    <circle r={5} fill="#7a5a00" />
                  </>
                ) : (
                  <>
                    <circle r={22} fill={TOKEN_COLOR[t.kind]} stroke="#fff" strokeWidth={2.5} />
                    <text textAnchor="middle" y={7} fill="#fff" fontSize={20} fontWeight={800} fontFamily="inherit">{t.label}</text>
                  </>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Diapositivas + reproducción */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={play} disabled={dg.slides.length < 2}
          style={{ ...btnPrimary, opacity: dg.slides.length < 2 ? 0.5 : 1, cursor: dg.slides.length < 2 ? 'not-allowed' : 'pointer' }}>
          {playing ? '■ Parar' : '▶ Reproducir'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>Transición</span>
          <input type="range" min={300} max={2200} step={100} value={dg.transitionMs} disabled={playing}
            onChange={(e) => setDg((prev) => ({ ...prev, transitionMs: Number(e.target.value) }))}
            style={{ width: 100, accentColor: 'var(--accent)', cursor: playing ? 'not-allowed' : 'pointer' }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace', minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>{(dg.transitionMs / 1000).toFixed(1)} s</span>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1, padding: 2 }}>
          {dg.slides.map((s, i) => (
            <div key={s.id} role="button" tabIndex={playing ? -1 : 0}
              aria-label={`Diapositiva ${i + 1}`} aria-current={i === cur}
              onClick={() => { if (!playing) setCur(i) }}
              onKeyDown={(e) => { if (!playing && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setCur(i) } }}
              style={{ position: 'relative', flex: 'none', width: 92, borderRadius: 9, overflow: 'hidden', cursor: playing ? 'default' : 'pointer', border: `2px solid ${i === cur ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--surface-card)' }}>
              <span style={{ position: 'absolute', top: 3, left: 4, fontSize: 10, fontFamily: 'ui-monospace, monospace', color: 'var(--text-secondary)', background: 'var(--surface-card)', padding: '0 4px', borderRadius: 5, zIndex: 1 }}>{i + 1}</span>
              {dg.slides.length > 1 && !playing && (
                <button type="button" onClick={(e) => { e.stopPropagation(); deleteSlide(i) }} title="Eliminar diapositiva"
                  style={{ position: 'absolute', top: 2, right: 2, width: 17, height: 17, borderRadius: 5, border: 'none', background: 'rgba(0,0,0,.35)', color: '#fff', cursor: 'pointer', fontSize: 11, lineHeight: 1, zIndex: 1 }}>✕</button>
              )}
              <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 56, display: 'block' }}>
                <rect x={R.x} y={R.y} width={R.w} height={R.h} rx={8} fill={COURT_BG} stroke={LINE} strokeOpacity={0.5} strokeWidth={4} />
                {dg.tokens.map((t) => {
                  const p = s.positions[t.id]
                  if (!p) return null
                  const px = toPx(p)
                  return <circle key={t.id} cx={px.x} cy={px.y} r={t.kind === 'ball' ? 16 : 26} fill={TOKEN_COLOR[t.kind] || 'var(--accent)'} />
                })}
              </svg>
            </div>
          ))}
        </div>
        <button type="button" onClick={addSlide} disabled={playing} style={btnSecondary} title="Duplica la diapositiva actual para crear el siguiente movimiento">＋ Diapositiva</button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
        Arrastra las fichas por el campo. Cada diapositiva guarda sus posiciones; al reproducir, las fichas se mueven de una a la siguiente.
      </p>
    </div>
  )
}

function nextLabel(tokens, kind) {
  if (kind === 'ball' || kind === 'cone') return ''
  if (kind === 'label') return 'Texto'
  const n = tokens.filter((t) => t.kind === kind).length + 1
  return String(n)
}
function normalizeDiagram(d) {
  const base = { courtType: 'volleyball', transitionMs: 900, tokens: [], slides: [{ id: genId('s'), positions: {} }] }
  if (!d || typeof d !== 'object') return base
  const courtType = COURT_TYPES.includes(d.courtType) ? d.courtType : 'volleyball'
  const transitionMs = Number.isFinite(Number(d.transitionMs)) ? Number(d.transitionMs) : 900
  const tokens = Array.isArray(d.tokens) ? d.tokens.filter((t) => t && t.id).map((t) => ({ id: String(t.id), kind: t.kind || 'playerA', label: String(t.label ?? '') })) : []
  let slides = Array.isArray(d.slides) && d.slides.length
    ? d.slides.map((s, i) => ({ id: String(s.id || genId('s')) + '_' + i, positions: s.positions && typeof s.positions === 'object' ? s.positions : {} }))
    : [{ id: genId('s'), positions: {} }]
  return { courtType, transitionMs, tokens, slides }
}

// ── Editor de ejercicio (overlay) ────────────────────────────────────────────
function ExerciseEditorModal({ exercise, blockId, defaultCourt, onClose, onSaved, api, showAlert }) {
  const isEdit = !!(exercise && exercise.id)
  const [name, setName] = useState(exercise?.name || '')
  const [durationMin, setDurationMin] = useState(exercise?.durationMin ?? '')
  const [players, setPlayers] = useState(exercise?.players ?? '')
  const [description, setDescription] = useState(exercise?.description || '')
  const [busy, setBusy] = useState(false)
  const diagramRef = useRef(exercise?.diagram || { courtType: defaultCourt || 'volleyball' })

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) { showAlert('Ponle un nombre al ejercicio.'); return }
    setBusy(true)
    try {
      const payload = {
        name: trimmed,
        description: description.trim() || null,
        durationMin: durationMin === '' ? null : Number(durationMin),
        players: players === '' ? null : Number(players),
        diagram: diagramRef.current,
      }
      if (isEdit) {
        await api(`/api/crm/training/exercises/${exercise.id}`, 'PATCH', payload)
      } else {
        await api('/api/crm/training/exercises', 'POST', { blockId, ...payload })
      }
      onSaved()
    } catch (e) {
      showAlert(e.message || 'No se pudo guardar el ejercicio.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.5)', backdropFilter: 'blur(3px)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ ...cardSt, width: '100%', maxWidth: 900, boxShadow: 'var(--card-shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{isEdit ? 'Editar ejercicio' : 'Nuevo ejercicio'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Diseña el diagrama con la pizarra táctica</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancelar</button>
            <button type="button" onClick={save} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{busy ? 'Guardando…' : 'Guardar ejercicio'}</button>
          </div>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div>
              <label style={labelSt}>Nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ataque por zona 4" style={inputSt} autoFocus />
            </div>
            <div>
              <label style={labelSt}>Duración (min)</label>
              <input type="number" min={0} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="10" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Jugadores</label>
              <input type="number" min={0} value={players} onChange={(e) => setPlayers(e.target.value)} placeholder="12" style={inputSt} />
            </div>
          </div>
          <div>
            <label style={labelSt}>Descripción / instrucciones</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Explica el ejercicio…" style={{ ...inputSt, resize: 'vertical' }} />
          </div>
          <TacticalBoard initial={exercise?.diagram || { courtType: defaultCourt || 'volleyball' }} onChange={(d) => { diagramRef.current = d }} />
        </div>
      </div>
    </div>
  )
}

// ── Modal genérico de formulario (crear/editar colección o sesión) ───────────
function FormModal({ title, onClose, children, onSubmit, submitLabel, busy }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.5)', backdropFilter: 'blur(3px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ ...cardSt, width: '100%', maxWidth: 480, boxShadow: 'var(--card-shadow-lg)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button type="button" onClick={onSubmit} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{busy ? 'Guardando…' : submitLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── Detalle de sesión (timeline de bloques y ejercicios) ─────────────────────
function SessionDetail({ sessionId, api, showAlert, showConfirm, onBack }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState(null) // { blockId, exercise? }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const j = await api(`/api/crm/training/sessions/${sessionId}`, 'GET')
      setSession(j.session)
    } catch (e) {
      showAlert(e.message || 'No se pudo cargar la sesión.')
      onBack()
    } finally {
      setLoading(false)
    }
  }, [sessionId, api, showAlert, onBack])

  useEffect(() => { load() }, [load])

  async function addBlock() {
    try {
      await api('/api/crm/training/blocks', 'POST', { sessionId, name: 'Nuevo bloque' })
      load()
    } catch (e) { showAlert(e.message) }
  }
  async function renameBlock(block) {
    const name = window.prompt('Nombre del bloque', block.name)
    if (name == null) return
    try { await api(`/api/crm/training/blocks/${block.id}`, 'PATCH', { name }); load() } catch (e) { showAlert(e.message) }
  }
  async function delBlock(block) {
    if (!(await showConfirm(`¿Eliminar el bloque "${block.name}" y sus ejercicios?`))) return
    try { await api(`/api/crm/training/blocks/${block.id}`, 'DELETE'); load() } catch (e) { showAlert(e.message) }
  }
  async function delExercise(ex) {
    if (!(await showConfirm(`¿Eliminar el ejercicio "${ex.name}"?`))) return
    try { await api(`/api/crm/training/exercises/${ex.id}`, 'DELETE'); load() } catch (e) { showAlert(e.message) }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando sesión…</div>
  if (!session) return null

  const totalDuration = session.durationMin || session.blocks.reduce((a, b) => a + (b.durationMin || 0), 0)
  const totalExercises = session.blocks.reduce((a, b) => a + b.exercises.length, 0)
  const tags = (session.tags || '').split(',').map((t) => t.trim()).filter(Boolean)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button type="button" onClick={onBack} style={{ ...btnGhost, alignSelf: 'flex-start' }}>← Volver al contenido</button>

      {/* Cabecera de la sesión */}
      <div style={{ ...cardSt, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            {session.collection?.name && (
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{session.collection.name}</div>
            )}
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{session.title}</h2>
            {session.objective && <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: 14, maxWidth: 640, whiteSpace: 'pre-wrap' }}>{session.objective}</p>}
            {tags.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                {tags.map((t) => <span key={t} style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: 'var(--accent-pill)', color: 'var(--accent)' }}>{t}</span>)}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{totalDuration || '—'}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 600 }}> min</span></div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{session.blocks.length} bloques · {totalExercises} ejercicios</div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline de bloques */}
      {session.blocks.map((block) => (
        <div key={block.id} style={{ ...cardSt, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 24px', background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)' }}>{block.name}</span>
              {block.durationMin ? <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>{block.durationMin} min</span> : null}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" onClick={() => renameBlock(block)} style={btnGhost}>Renombrar</button>
              <button type="button" onClick={() => delBlock(block)} style={{ ...btnGhost, color: 'var(--red)' }}>Eliminar</button>
            </div>
          </div>
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {block.exercises.map((ex) => (
              <div key={ex.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-card)' }}>
                <div style={{ background: 'var(--surface-low)' }}>
                  <MiniCourt diagram={ex.diagram} courtType={ex.courtType} height={120} />
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 6 }}>{ex.name}</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    {ex.durationMin ? <span>⏱ {ex.durationMin} min</span> : null}
                    {ex.players ? <span>👥 {ex.players}</span> : null}
                    <span>{COURT_LABELS[ex.courtType] || COURT_LABELS[(ex.diagram && ex.diagram.courtType)] || 'Campo'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => setEditor({ blockId: block.id, exercise: ex })} style={{ ...btnSecondary, padding: '7px 12px', fontSize: 12 }}>Abrir pizarra</button>
                    <button type="button" onClick={() => delExercise(ex)} style={{ ...btnGhost, padding: '7px 10px', fontSize: 12, color: 'var(--red)' }}>Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setEditor({ blockId: block.id, exercise: null })}
              style={{ border: '1px dashed var(--border-strong)', borderRadius: 12, background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, minHeight: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ fontSize: 26, color: 'var(--accent)' }}>＋</span>
              Añadir ejercicio
            </button>
          </div>
        </div>
      ))}

      <button type="button" onClick={addBlock} style={{ ...btnSecondary, alignSelf: 'flex-start' }}>＋ Añadir bloque</button>

      {editor && (
        <ExerciseEditorModal
          exercise={editor.exercise}
          blockId={editor.blockId}
          defaultCourt={session.blocks.find((b) => b.id === editor.blockId)?.exercises?.[0]?.courtType || 'volleyball'}
          api={api}
          showAlert={showAlert}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load() }}
        />
      )}
    </div>
  )
}

// Acciones (renombrar / eliminar) en la esquina de una tarjeta clicable.
function CardActions({ onRename, onDelete }) {
  const st = { width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: 0 }
  return (
    <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6, zIndex: 2 }}>
      <button type="button" title="Renombrar" aria-label="Renombrar" onClick={(e) => { e.stopPropagation(); onRename() }} style={st}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
      </button>
      <button type="button" title="Eliminar" aria-label="Eliminar" onClick={(e) => { e.stopPropagation(); onDelete() }} style={{ ...st, color: 'var(--red)' }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
      </button>
    </div>
  )
}

// ── Navegador de contenido + sección raíz ────────────────────────────────────
export function EntrenamientoSection({ showAlert, showConfirm }) {
  const [collections, setCollections] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todo') // todo | colecciones | sesiones
  const [search, setSearch] = useState('')
  const [openCollection, setOpenCollection] = useState(null) // collection object
  const [openSessionId, setOpenSessionId] = useState(null)
  const [modal, setModal] = useState(null) // { type:'collection'|'session' }

  const api = useCallback(async (url, method, body) => {
    const r = await fetch(url, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (r.status === 401) { window.location.href = '/login?callbackUrl=' + encodeURIComponent('/'); throw new Error('No autorizado') }
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Error de servidor')
    return j
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [jc, js] = await Promise.all([
        api('/api/crm/training/collections', 'GET'),
        api('/api/crm/training/sessions', 'GET'),
      ])
      setCollections(jc.collections || [])
      setSessions(js.sessions || [])
    } catch (e) {
      showAlert(e.message || 'No se pudo cargar el contenido de entrenamiento.')
    } finally {
      setLoading(false)
    }
  }, [api, showAlert])

  useEffect(() => { load() }, [load])

  async function renameCollection(c) {
    const name = window.prompt('Nombre de la colección', c.name)
    if (name == null) return
    try { await api(`/api/crm/training/collections/${c.id}`, 'PATCH', { name }); load() } catch (e) { showAlert(e.message) }
  }
  async function delCollection(c) {
    if (!(await showConfirm(`¿Eliminar la colección "${c.name}"? Sus sesiones no se borran, quedan sueltas.`))) return
    try {
      await api(`/api/crm/training/collections/${c.id}`, 'DELETE')
      if (openCollection?.id === c.id) setOpenCollection(null)
      load()
    } catch (e) { showAlert(e.message) }
  }
  async function renameSession(s) {
    const title = window.prompt('Título de la sesión', s.title)
    if (title == null) return
    try { await api(`/api/crm/training/sessions/${s.id}`, 'PATCH', { title }); load() } catch (e) { showAlert(e.message) }
  }
  async function delSession(s) {
    if (!(await showConfirm(`¿Eliminar la sesión "${s.title}" y todo su contenido?`))) return
    try { await api(`/api/crm/training/sessions/${s.id}`, 'DELETE'); load() } catch (e) { showAlert(e.message) }
  }

  // nº de ejercicios por colección (agregado en cliente desde las sesiones)
  const exercisesByCollection = React.useMemo(() => {
    const map = {}
    for (const s of sessions) {
      if (!s.collectionId) continue
      map[s.collectionId] = (map[s.collectionId] || 0) + (s.exerciseCount || 0)
    }
    return map
  }, [sessions])

  if (openSessionId) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 40px 56px' }}>
          <SessionDetail
            sessionId={openSessionId}
            api={api}
            showAlert={showAlert}
            showConfirm={showConfirm}
            onBack={() => { setOpenSessionId(null); load() }}
          />
        </div>
      </div>
    )
  }

  const q = search.trim().toLowerCase()
  const matchCol = (c) => !q || c.name.toLowerCase().includes(q) || (c.tags || '').toLowerCase().includes(q)
  const matchSes = (s) => !q || s.title.toLowerCase().includes(q) || (s.tags || '').toLowerCase().includes(q) || (s.objective || '').toLowerCase().includes(q)

  const shownCollections = collections.filter(matchCol)
  const shownSessions = sessions
    .filter((s) => (openCollection ? s.collectionId === openCollection.id : true))
    .filter(matchSes)

  const showCols = !openCollection && (filter === 'todo' || filter === 'colecciones')
  const showSes = openCollection || filter === 'todo' || filter === 'sesiones'

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 40px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Cabecera */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>Entrenamiento</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '6px 0 0' }}>Colecciones, sesiones y ejercicios con pizarra táctica interactiva.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setModal({ type: 'collection' })} style={btnSecondary}>＋ Nueva colección</button>
            <button type="button" onClick={() => setModal({ type: 'session' })} style={btnPrimary}>＋ Nueva sesión</button>
          </div>
        </div>

        {/* Filtros + búsqueda */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {openCollection ? (
            <button type="button" onClick={() => setOpenCollection(null)} style={btnGhost}>← Todas las colecciones</button>
          ) : (
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-low)', borderRadius: 999, padding: 4 }}>
              {[['todo', 'Todo'], ['colecciones', 'Colecciones'], ['sesiones', 'Sesiones']].map(([v, label]) => (
                <button key={v} type="button" onClick={() => setFilter(v)}
                  style={{ padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: filter === v ? 'var(--surface-card)' : 'transparent', color: filter === v ? 'var(--accent)' : 'var(--text-muted)', boxShadow: filter === v ? 'var(--card-shadow)' : 'none' }}>{label}</button>
              ))}
            </div>
          )}
          {openCollection && (
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{openCollection.name}</span>
          )}
          <div style={{ flex: 1 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" style={{ ...inputSt, width: 220, padding: '9px 12px', fontSize: 13 }} />
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando contenido…</div>
        ) : (
          <>
            {/* Colecciones */}
            {showCols && (
              shownCollections.length > 0 ? (
                <div>
                  {filter === 'todo' && <div style={{ ...labelSt, marginBottom: 12 }}>Colecciones</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                    {shownCollections.map((c) => (
                      <div key={c.id} role="button" tabIndex={0}
                        onClick={() => { setOpenCollection(c); setFilter('sesiones') }}
                        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setOpenCollection(c); setFilter('sesiones') } }}
                        style={{ ...cardSt, position: 'relative', padding: 20, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <CardActions onRename={() => renameCollection(c)} onDelete={() => delCollection(c)} />
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-pill)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h5l2 2h9v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /></svg>
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{c.name}</div>
                          {c.description && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.description}</div>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{c.sessionCount} sesiones · {exercisesByCollection[c.id] || 0} ejercicios{COURT_LABELS[c.courtType] ? ` · ${COURT_LABELS[c.courtType]}` : ''}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : filter === 'colecciones' ? (
                <EmptyState isCollection filtered={!!q} onCreate={() => setModal({ type: 'collection' })} />
              ) : null
            )}

            {/* Sesiones */}
            {showSes && (
              <div>
                {filter === 'todo' && !openCollection && shownSessions.length > 0 && <div style={{ ...labelSt, marginBottom: 12 }}>Sesiones</div>}
                {shownSessions.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                    {shownSessions.map((s) => (
                      <div key={s.id} role="button" tabIndex={0}
                        onClick={() => setOpenSessionId(s.id)}
                        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setOpenSessionId(s.id) } }}
                        style={{ ...cardSt, position: 'relative', padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column' }}>
                        <CardActions onRename={() => renameSession(s)} onDelete={() => delSession(s)} />
                        <div style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                          <MiniCourt diagram={s.thumb?.diagram} courtType={s.thumb?.courtType || 'volleyball'} height={110} />
                        </div>
                        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {s.collectionName && !openCollection && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.collectionName}</div>}
                          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{s.title}</div>
                          {s.objective && <div style={{ fontSize: 13, color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.objective}</div>}
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>
                            {s.durationMin ? `${s.durationMin} min · ` : ''}{s.blockCount} bloques · {s.exerciseCount} ejercicios
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    onCreate={() => setModal({ type: 'session', collectionId: openCollection?.id })}
                    filtered={!!q}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {modal?.type === 'collection' && (
        <CollectionModal api={api} showAlert={showAlert} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
      )}
      {modal?.type === 'session' && (
        <SessionModal api={api} showAlert={showAlert} collections={collections} defaultCollectionId={modal.collectionId || openCollection?.id || ''} onClose={() => setModal(null)} onSaved={(id) => { setModal(null); load(); if (id) setOpenSessionId(id) }} />
      )}
    </div>
  )
}

function EmptyState({ onCreate, filtered, isCollection }) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px dashed var(--border-strong)', borderRadius: 14, padding: '48px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
        {filtered ? 'Sin resultados para tu búsqueda' : isCollection ? 'Aún no hay colecciones' : 'Aún no hay sesiones'}
      </div>
      {!filtered && (
        <>
          <p style={{ margin: 0, maxWidth: 440, color: 'var(--text-secondary)', fontSize: 14 }}>
            {isCollection ? 'Agrupa tus sesiones en colecciones (por equipo, temporada o temática).' : 'Crea tu primera sesión con bloques y ejercicios, cada uno con su pizarra táctica.'}
          </p>
          <button type="button" onClick={onCreate} style={btnPrimary}>＋ {isCollection ? 'Nueva colección' : 'Nueva sesión'}</button>
        </>
      )}
    </div>
  )
}

function CollectionModal({ api, showAlert, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [courtType, setCourtType] = useState('volleyball')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!name.trim()) { showAlert('Ponle un nombre a la colección.'); return }
    setBusy(true)
    try {
      await api('/api/crm/training/collections', 'POST', { name, courtType, description, tags })
      onSaved()
    } catch (e) { showAlert(e.message) } finally { setBusy(false) }
  }
  return (
    <FormModal title="Nueva colección" onClose={onClose} onSubmit={submit} submitLabel="Crear colección" busy={busy}>
      <div><label style={labelSt}>Nombre</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Entrenamiento de voleibol" style={inputSt} autoFocus /></div>
      <div><label style={labelSt}>Deporte / campo por defecto</label>
        <select value={courtType} onChange={(e) => setCourtType(e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
          {COURT_TYPES.map((t) => <option key={t} value={t}>{COURT_LABELS[t]}</option>)}
        </select>
      </div>
      <div><label style={labelSt}>Descripción</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Opcional" style={{ ...inputSt, resize: 'vertical' }} /></div>
      <div><label style={labelSt}>Etiquetas (separadas por coma)</label><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ataque, defensa…" style={inputSt} /></div>
    </FormModal>
  )
}

function SessionModal({ api, showAlert, collections, defaultCollectionId, onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [collectionId, setCollectionId] = useState(defaultCollectionId || '')
  const [objective, setObjective] = useState('')
  const [tags, setTags] = useState('')
  const [durationMin, setDurationMin] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!title.trim()) { showAlert('Ponle un título a la sesión.'); return }
    setBusy(true)
    try {
      const j = await api('/api/crm/training/sessions', 'POST', {
        title, collectionId: collectionId || null, objective, tags,
        durationMin: durationMin === '' ? null : Number(durationMin),
      })
      onSaved(j.id)
    } catch (e) { showAlert(e.message) } finally { setBusy(false) }
  }
  return (
    <FormModal title="Nueva sesión" onClose={onClose} onSubmit={submit} submitLabel="Crear sesión" busy={busy}>
      <div><label style={labelSt}>Título</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Consolidación del ataque" style={inputSt} autoFocus /></div>
      <div><label style={labelSt}>Colección</label>
        <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
          <option value="">Sin colección (suelta)</option>
          {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div><label style={labelSt}>Objetivo</label><textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={2} placeholder="Opcional" style={{ ...inputSt, resize: 'vertical' }} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
        <div><label style={labelSt}>Etiquetas</label><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="técnica, físico…" style={inputSt} /></div>
        <div><label style={labelSt}>Duración (min)</label><input type="number" min={0} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="90" style={inputSt} /></div>
      </div>
    </FormModal>
  )
}

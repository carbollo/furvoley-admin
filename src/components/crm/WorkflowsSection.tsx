'use client'

import { useCallback, useState, type CSSProperties, type FormEvent } from 'react'
import { Zap, Plus, X } from 'lucide-react'

type PasoForm = {
  stepType: string
  actionType: string
  config: Record<string, unknown>
}

function defaultStepConfig(actionType: string): Record<string, unknown> {
  switch (actionType) {
    case 'ASSIGN_TEAM':
      return { teamId: '' }
    case 'ASSIGN_TEAM_BY_AGE':
      return { teamId: '', minAge: '', maxAge: '' }
    case 'SET_MEMBER_STATUS':
      return { targetStatus: 'ACTIVE' }
    case 'CREATE_PAYMENT':
      return { amount: '', monthOffset: '0', paymentStatus: 'PENDING' }
    case 'HTTP_REQUEST':
      return { httpUrl: '', httpMethod: 'POST', httpBody: '', httpHeaders: '' }
    case 'BRANCH_IF':
      return {
        ifField: 'member.age',
        ifOperator: 'gte',
        ifValue: '',
        thenTargetKey: '',
        elseTargetKey: '',
      }
    default:
      return {}
  }
}

function etiquetaDisparador(t: string) {
  const m: Record<string, string> = { MEMBER_CREATED: 'Alta de socio' }
  return m[t] ?? t
}

function resumenPrimerPaso(
  actionType: string,
  config: unknown,
  nombreEquipo: (id: string) => string,
) {
  const c = config && typeof config === 'object' ? (config as Record<string, unknown>) : {}
  const eq = (id: unknown) => nombreEquipo(String(id || ''))
  switch (actionType) {
    case 'ASSIGN_TEAM':
      return `Asignar → ${eq(c.teamId) || 'equipo…'}`
    case 'ASSIGN_TEAM_BY_AGE': {
      const r = [c.minAge, c.maxAge].filter((x) => x !== '' && x != null).join('–')
      return `Por edad (${r || '…'}) → ${eq(c.teamId)}`
    }
    case 'SET_MEMBER_STATUS':
      return String(c.targetStatus) === 'INACTIVE' ? 'Estado inactivo' : 'Estado activo'
    case 'CREATE_PAYMENT':
      return `Pago ${c.amount ?? '?'} €`
    case 'HTTP_REQUEST':
      return `HTTP ${String(c.httpMethod || 'GET')} ${String(c.httpUrl || '').slice(0, 32)}…`
    case 'BRANCH_IF':
      return `Condición (${String(c.ifField || '…')})`
    default:
      return actionType
  }
}

function prepararConfigParaApi(actionType: string, raw: Record<string, unknown>) {
  const o = { ...raw }
  if (actionType === 'CREATE_PAYMENT') {
    if (o.amount !== '' && o.amount != null) {
      const n = Number(o.amount)
      if (!Number.isFinite(n) || n <= 0) delete o.amount
      else o.amount = n
    }
    if (o.monthOffset !== '' && o.monthOffset != null) {
      const n = Math.trunc(Number(o.monthOffset))
      if (Number.isFinite(n)) o.monthOffset = String(n)
    }
  }
  if (actionType === 'ASSIGN_TEAM_BY_AGE') {
    if (o.minAge !== '' && o.minAge != null) {
      const n = Number(o.minAge)
      if (Number.isFinite(n)) o.minAge = String(n)
    }
    if (o.maxAge !== '' && o.maxAge != null) {
      const n = Number(o.maxAge)
      if (Number.isFinite(n)) o.maxAge = String(n)
    }
  }
  Object.keys(o).forEach((k) => {
    if (o[k] === '') delete o[k]
  })
  return o
}

const ACCIONES = [
  { value: 'ASSIGN_TEAM', label: 'Asignar a un equipo' },
  { value: 'ASSIGN_TEAM_BY_AGE', label: 'Asignar por rango de edad' },
  { value: 'SET_MEMBER_STATUS', label: 'Cambiar estado del socio' },
  { value: 'CREATE_PAYMENT', label: 'Registrar cobro (cuota)' },
  { value: 'HTTP_REQUEST', label: 'Petición HTTP' },
  { value: 'BRANCH_IF', label: 'Condición (ramificar)' },
] as const

const inputBase = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.09)',
  fontFamily: 'inherit',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box' as const,
}

const labelBase = {
  fontSize: 12,
  fontWeight: 600 as const,
  color: '#64748b',
  marginBottom: 6,
  display: 'block' as const,
}

type BundleEquip = { id: string; nombre: string }

export function WorkflowsSection({
  bundle,
  reload,
}: {
  bundle: Record<string, unknown> | null
  reload: () => Promise<unknown>
}) {
  const wfs = (bundle?.workflows as Record<string, unknown>[]) ?? []
  const equipos = (bundle?.equipos as BundleEquip[]) ?? []

  const nombreEquipo = useCallback(
    (id: string) => equipos.find((e) => e.id === id)?.nombre ?? '',
    [equipos],
  )

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [pasosForm, setPasosForm] = useState<PasoForm[]>([])
  const [saveBusy, setSaveBusy] = useState(false)

  const activos = wfs.filter((w) => w.activo).length
  const totalPasos = wfs.reduce((a, w) => a + ((w.pasos as unknown[])?.length ?? 0), 0)

  const triggerColors: Record<string, string> = { MEMBER_CREATED: '#10B981' }
  const colorTrig = (t: string) => triggerColors[t] || '#64748b'

  const toggle = async (id: string) => {
    const r = await fetch(`/api/crm/workflows/${id}/toggle`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!r.ok) {
      alert('No se pudo cambiar el estado')
      return
    }
    await reload()
  }

  const openNuevo = () => {
    setEditingId(null)
    setNombre('')
    setDescripcion('')
    setPasosForm([
      { stepType: 'ACTION', actionType: 'ASSIGN_TEAM', config: defaultStepConfig('ASSIGN_TEAM') },
    ])
    setEditorOpen(true)
  }

  const openEditar = (w: Record<string, unknown>) => {
    setEditingId(String(w.id))
    setNombre(String(w.nombre || ''))
    setDescripcion(String(w.descripcion || ''))
    const pasos = (w.pasos as Record<string, unknown>[]) || []
    if (pasos.length) {
      setPasosForm(
        pasos.map((p) => ({
          stepType: String(p.stepType || 'ACTION'),
          actionType: String(p.actionType),
          config:
            p.config && typeof p.config === 'object' && !Array.isArray(p.config)
              ? { ...(p.config as Record<string, unknown>) }
              : defaultStepConfig(String(p.actionType)),
        })),
      )
    } else {
      setPasosForm([
        {
          stepType: 'ACTION',
          actionType: 'ASSIGN_TEAM',
          config: defaultStepConfig('ASSIGN_TEAM'),
        },
      ])
    }
    setEditorOpen(true)
  }

  const eliminar = async (id: string, titulo: string) => {
    if (!confirm(`¿Eliminar el flujo «${titulo}»? Esta acción no se puede deshacer.`)) return
    const r = await fetch(`/api/crm/workflows/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!r.ok) {
      let msg = 'No se pudo eliminar'
      try {
        msg = (await r.json()).error || msg
      } catch {
        //
      }
      alert(msg)
      return
    }
    await reload()
  }

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    const n = nombre.trim()
    if (!n) {
      alert('El nombre del flujo es obligatorio.')
      return
    }
    if (!pasosForm.length) {
      alert('Añade al menos un paso.')
      return
    }
    setSaveBusy(true)
    try {
      const steps = pasosForm.map((p, i) => ({
        position: i,
        stepType: p.stepType || 'ACTION',
        actionType: p.actionType,
        config: prepararConfigParaApi(p.actionType, p.config),
      }))
      const payload = {
        name: n,
        description: descripcion.trim() || null,
        triggerType: 'MEMBER_CREATED',
        isActive: true,
        steps,
      }
      const url = editingId ? `/api/crm/workflows/${editingId}` : '/api/crm/workflows'
      const r = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        let msg = 'No se pudo guardar'
        try {
          msg = (await r.json()).error || msg
        } catch {
          //
        }
        alert(msg)
        return
      }
      setEditorOpen(false)
      await reload()
    } finally {
      setSaveBusy(false)
    }
  }

  const setPasoAction = (idx: number, actionType: string) => {
    setPasosForm((prev) => {
      const next = [...prev]
      const prevKey =
        next[idx]?.config && typeof next[idx].config === 'object'
          ? (next[idx].config as Record<string, unknown>).stepKey
          : undefined
      next[idx] = {
        stepType: 'ACTION',
        actionType,
        config: {
          ...defaultStepConfig(actionType),
          ...(prevKey != null && String(prevKey).trim() !== ''
            ? { stepKey: String(prevKey) }
            : {}),
        },
      }
      return next
    })
  }

  const patchConfig = (idx: number, patch: Record<string, unknown>) => {
    setPasosForm((prev) => {
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        config: { ...next[idx].config, ...patch },
      }
      return next
    })
  }

  const removePaso = (idx: number) => {
    setPasosForm((prev) => prev.filter((_, i) => i !== idx))
  }

  const addPaso = () => {
    setPasosForm((prev) => [
      ...prev,
      { stepType: 'ACTION', actionType: 'ASSIGN_TEAM', config: defaultStepConfig('ASSIGN_TEAM') },
    ])
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '32px 36px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', letterSpacing: '-0.5px' }}>
            Flujos de trabajo
          </h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
            Flujos activos: {activos} / {wfs.length || 0} · Se ejecutan al dar de alta un socio (inscripción / alta).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() =>
              window.alert(
                'Cada flujo corre cuando se registra un nuevo socio. Añade pasos en orden: asignar equipo, cambiar estado, avisar por HTTP, etc. Las ramas (Condición) saltan a otros pasos usando la «Clave del paso».',
              )
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: '#fff',
              color: '#64748b',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Ayuda
          </button>
          <button
            type="button"
            onClick={openNuevo}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              background: 'var(--accent)',
              color: '#fff',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            Nuevo flujo
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Flujos configurados', value: String(wfs.length), color: 'var(--accent)' },
          { label: 'Activos', value: String(activos), color: 'var(--green)' },
          { label: 'Pasos totales', value: String(totalPasos), color: '#8B5CF6' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              flex: 1,
              minWidth: 140,
              background: '#fff',
              borderRadius: 14,
              padding: '16px 20px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-1px' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {wfs.length === 0 && (
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: '48px 24px',
              textAlign: 'center',
              border: '1px dashed var(--border)',
              color: '#9ca3af',
              fontSize: 15,
            }}
          >
            No hay flujos todavía. Crea uno para automatizar tareas al registrar socios.
          </div>
        )}
        {wfs.map((w) => {
          const pasos = (w.pasos as Record<string, unknown>[]) || []
          const first = pasos[0]
          const resumen = first
            ? resumenPrimerPaso(
                String(first.actionType),
                first.config,
                nombreEquipo,
              )
            : '—'
          return (
            <div
              key={String(w.id)}
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '20px 24px',
                boxShadow: 'var(--card-shadow)',
                border: '1px solid var(--border)',
                opacity: w.activo ? 1 : 0.65,
                transition: 'opacity 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: w.activo ? 'var(--accent-light)' : '#F1F5F9',
                    color: w.activo ? 'var(--accent)' : '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Zap size={22} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{String(w.nombre)}</div>
                    {w.activo ? (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'var(--green-light)',
                          color: 'var(--green)',
                        }}
                      >
                        Activo
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: '#F1F5F9',
                          color: '#9ca3af',
                        }}
                      >
                        Pausado
                      </span>
                    )}
                  </div>
                  {w.descripcion ? (
                    <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 8px', lineHeight: 1.45 }}>
                      {String(w.descripcion)}
                    </p>
                  ) : null}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: 999,
                        background: `${colorTrig(String(w.trigger))}15`,
                        color: colorTrig(String(w.trigger)),
                      }}
                    >
                      ⚡ {etiquetaDisparador(String(w.trigger))}
                    </span>
                    <span style={{ color: '#9ca3af', fontSize: 12 }}>→</span>
                    <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{resumen}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
                    {pasos.length} paso{pasos.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => openEditar(w)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: '#fff',
                      cursor: 'pointer',
                      color: '#374151',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => eliminar(String(w.id), String(w.nombre))}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: '1px solid #fecaca',
                      background: '#fff',
                      cursor: 'pointer',
                      color: '#b91c1c',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    Eliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(String(w.id))}
                    title={w.activo ? 'Pausar' : 'Activar'}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      cursor: 'pointer',
                      background: w.activo ? 'var(--green)' : '#D1D5DB',
                      position: 'relative',
                      transition: 'background 0.2s',
                      flexShrink: 0,
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: '#fff',
                        position: 'absolute',
                        top: 3,
                        left: w.activo ? 23 : 3,
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      }}
                    />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {editorOpen && (
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
            if (e.target !== e.currentTarget || saveBusy) return
            setEditorOpen(false)
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={guardar}
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '92vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 16,
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.28)',
              padding: 28,
              fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111827' }}>
                  {editingId ? 'Editar flujo' : 'Nuevo flujo'}
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
                  Disparador: alta de socio — los pasos se ejecutan en orden.
                </p>
              </div>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => setEditorOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: 10,
                  width: 36,
                  height: 36,
                  cursor: saveBusy ? 'not-allowed' : 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelBase}>Nombre del flujo *</label>
              <input
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                style={inputBase as CSSProperties}
                placeholder="Ej. Asignación juveniles"
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelBase}>Descripción (opcional)</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={2}
                style={{ ...inputBase, minHeight: 64, resize: 'vertical' } as CSSProperties}
                placeholder="Notas para el equipo administrativo…"
              />
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Pasos</div>
            {pasosForm.map((p, idx) => (
              <div
                key={idx}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 12,
                  background: '#fafafa',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Paso {idx + 1}</span>
                  {pasosForm.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePaso(idx)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#b91c1c',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                      }}
                    >
                      Quitar paso
                    </button>
                  )}
                </div>
                <label style={labelBase}>Tipo de acción</label>
                <select
                  value={p.actionType}
                  onChange={(e) => setPasoAction(idx, e.target.value)}
                  style={{ ...inputBase, cursor: 'pointer' } as CSSProperties}
                >
                  {ACCIONES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <label style={{ ...labelBase, marginTop: 12 }}>Clave del paso (opcional, para ramas)</label>
                <input
                  value={String(p.config.stepKey ?? '')}
                  onChange={(e) => patchConfig(idx, { stepKey: e.target.value })}
                  style={inputBase as CSSProperties}
                  placeholder="ej. mayor_edad"
                />

                {p.actionType === 'ASSIGN_TEAM' && (
                  <>
                    <label style={{ ...labelBase, marginTop: 12 }}>Equipo</label>
                    <select
                      value={String(p.config.teamId ?? '')}
                      onChange={(e) => patchConfig(idx, { teamId: e.target.value })}
                      style={{ ...inputBase, cursor: 'pointer' } as CSSProperties}
                    >
                      <option value="">— Seleccionar —</option>
                      {equipos.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.nombre}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                {p.actionType === 'ASSIGN_TEAM_BY_AGE' && (
                  <>
                    <label style={{ ...labelBase, marginTop: 12 }}>Equipo</label>
                    <select
                      value={String(p.config.teamId ?? '')}
                      onChange={(e) => patchConfig(idx, { teamId: e.target.value })}
                      style={{ ...inputBase, cursor: 'pointer' } as CSSProperties}
                    >
                      <option value="">— Seleccionar —</option>
                      {equipos.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.nombre}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                      <div>
                        <label style={labelBase}>Edad mínima</label>
                        <input
                          type="number"
                          value={String(p.config.minAge ?? '')}
                          onChange={(e) => patchConfig(idx, { minAge: e.target.value })}
                          style={inputBase as CSSProperties}
                          min={0}
                        />
                      </div>
                      <div>
                        <label style={labelBase}>Edad máxima</label>
                        <input
                          type="number"
                          value={String(p.config.maxAge ?? '')}
                          onChange={(e) => patchConfig(idx, { maxAge: e.target.value })}
                          style={inputBase as CSSProperties}
                          min={0}
                        />
                      </div>
                    </div>
                  </>
                )}

                {p.actionType === 'SET_MEMBER_STATUS' && (
                  <>
                    <label style={{ ...labelBase, marginTop: 12 }}>Estado</label>
                    <select
                      value={String(p.config.targetStatus ?? 'ACTIVE')}
                      onChange={(e) => patchConfig(idx, { targetStatus: e.target.value })}
                      style={{ ...inputBase, cursor: 'pointer' } as CSSProperties}
                    >
                      <option value="ACTIVE">Activo</option>
                      <option value="INACTIVE">Inactivo</option>
                    </select>
                  </>
                )}

                {p.actionType === 'CREATE_PAYMENT' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 12 }}>
                    <div>
                      <label style={labelBase}>Importe (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={String(p.config.amount ?? '')}
                        onChange={(e) => patchConfig(idx, { amount: e.target.value })}
                        style={inputBase as CSSProperties}
                      />
                    </div>
                    <div>
                      <label style={labelBase}>Mes offset</label>
                      <input
                        type="number"
                        value={String(p.config.monthOffset ?? '0')}
                        onChange={(e) => patchConfig(idx, { monthOffset: e.target.value })}
                        style={inputBase as CSSProperties}
                      />
                    </div>
                    <div>
                      <label style={labelBase}>Estado cobro</label>
                      <select
                        value={String(p.config.paymentStatus ?? 'PENDING')}
                        onChange={(e) => patchConfig(idx, { paymentStatus: e.target.value })}
                        style={{ ...inputBase, cursor: 'pointer' } as CSSProperties}
                      >
                        <option value="PENDING">Pendiente</option>
                        <option value="PAID">Pagado</option>
                      </select>
                    </div>
                  </div>
                )}

                {p.actionType === 'HTTP_REQUEST' && (
                  <>
                    <label style={{ ...labelBase, marginTop: 12 }}>URL https</label>
                    <input
                      value={String(p.config.httpUrl ?? '')}
                      onChange={(e) => patchConfig(idx, { httpUrl: e.target.value })}
                      style={inputBase as CSSProperties}
                      placeholder="https://…"
                    />
                    <label style={{ ...labelBase, marginTop: 10 }}>Método</label>
                    <select
                      value={String(p.config.httpMethod ?? 'POST')}
                      onChange={(e) => patchConfig(idx, { httpMethod: e.target.value })}
                      style={{ ...inputBase, cursor: 'pointer' } as CSSProperties}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                    </select>
                    <label style={{ ...labelBase, marginTop: 10 }}>Cuerpo (opc., plantillas {'{memberName}'})</label>
                    <textarea
                      value={String(p.config.httpBody ?? '')}
                      onChange={(e) => patchConfig(idx, { httpBody: e.target.value })}
                      rows={3}
                      style={{ ...inputBase, minHeight: 72, resize: 'vertical' } as CSSProperties}
                    />
                    <label style={{ ...labelBase, marginTop: 10 }}>Cabeceras JSON (opc.)</label>
                    <input
                      value={String(p.config.httpHeaders ?? '')}
                      onChange={(e) => patchConfig(idx, { httpHeaders: e.target.value })}
                      style={inputBase as CSSProperties}
                      placeholder='{"Authorization":"Bearer …"}'
                    />
                  </>
                )}

                {p.actionType === 'BRANCH_IF' && (
                  <>
                    <label style={{ ...labelBase, marginTop: 12 }}>Campo</label>
                    <select
                      value={String(p.config.ifField ?? 'member.age')}
                      onChange={(e) => patchConfig(idx, { ifField: e.target.value })}
                      style={{ ...inputBase, cursor: 'pointer' } as CSSProperties}
                    >
                      <option value="member.age">Edad</option>
                      <option value="member.status">Estado del socio</option>
                      <option value="member.hasBirthDate">Tiene fecha de nacimiento</option>
                      <option value="member.name">Nombre</option>
                      <option value="member.email">Correo</option>
                    </select>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 12 }}>
                      <div>
                        <label style={labelBase}>Operador</label>
                        <select
                          value={String(p.config.ifOperator ?? 'gte')}
                          onChange={(e) => patchConfig(idx, { ifOperator: e.target.value })}
                          style={{ ...inputBase, cursor: 'pointer' } as CSSProperties}
                        >
                          <option value="eq">igual</option>
                          <option value="ne">distinto</option>
                          <option value="lt">menor</option>
                          <option value="lte">menor o igual</option>
                          <option value="gt">mayor</option>
                          <option value="gte">mayor o igual</option>
                          <option value="contains">contiene</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelBase}>Valor</label>
                        <input
                          value={String(p.config.ifValue ?? '')}
                          onChange={(e) => patchConfig(idx, { ifValue: e.target.value })}
                          style={inputBase as CSSProperties}
                        />
                      </div>
                    </div>
                    <label style={{ ...labelBase, marginTop: 10 }}>Si cumple → clave de paso</label>
                    <input
                      value={String(p.config.thenTargetKey ?? '')}
                      onChange={(e) => patchConfig(idx, { thenTargetKey: e.target.value })}
                      style={inputBase as CSSProperties}
                    />
                    <label style={{ ...labelBase, marginTop: 8 }}>Si no cumple → clave de paso</label>
                    <input
                      value={String(p.config.elseTargetKey ?? '')}
                      onChange={(e) => patchConfig(idx, { elseTargetKey: e.target.value })}
                      style={inputBase as CSSProperties}
                    />
                  </>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addPaso}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '10px',
                borderRadius: 12,
                border: '1px dashed var(--border)',
                background: '#fff',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--accent)',
                marginBottom: 22,
              }}
            >
              <Plus size={16} />
              Añadir paso
            </button>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => setEditorOpen(false)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1.5px solid rgba(0,0,0,0.09)',
                  background: '#fff',
                  cursor: saveBusy ? 'not-allowed' : 'pointer',
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
                disabled={saveBusy}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--accent)',
                  cursor: saveBusy ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  opacity: saveBusy ? 0.75 : 1,
                }}
              >
                {saveBusy ? 'Guardando…' : 'Guardar flujo'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

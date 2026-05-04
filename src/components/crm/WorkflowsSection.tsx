'use client'

import { useCallback, useState } from 'react'
import { Zap, Plus } from 'lucide-react'
import { WorkflowFlowEditor, type WorkflowEditorInitialPaso } from './WorkflowFlowEditor'

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
  const [editorSession, setEditorSession] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [initialNombre, setInitialNombre] = useState('')
  const [initialDescripcion, setInitialDescripcion] = useState('')
  const [initialPasos, setInitialPasos] = useState<WorkflowEditorInitialPaso[]>([])
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
    setInitialNombre('')
    setInitialDescripcion('')
    setInitialPasos([])
    setEditorSession((s) => s + 1)
    setEditorOpen(true)
  }

  const openEditar = (w: Record<string, unknown>) => {
    setEditingId(String(w.id))
    setInitialNombre(String(w.nombre || ''))
    setInitialDescripcion(String(w.descripcion || ''))
    const pasos = (w.pasos as Record<string, unknown>[]) || []
    setInitialPasos(
      pasos.map((p, i) => ({
        position: typeof p.position === 'number' ? p.position : i,
        stepType: String(p.stepType || 'ACTION'),
        actionType: String(p.actionType),
        config: p.config,
      })),
    )
    setEditorSession((s) => s + 1)
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

  const handleSaveFromEditor = async (payload: {
    name: string
    description: string | null
    steps: Array<{ position: number; stepType: string; actionType: string; config: Record<string, unknown> }>
  }) => {
    setSaveBusy(true)
    try {
      const body = {
        name: payload.name,
        description: payload.description,
        triggerType: 'MEMBER_CREATED',
        isActive: true,
        steps: payload.steps,
      }
      const url = editingId ? `/api/crm/workflows/${editingId}` : '/api/crm/workflows'
      const r = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
                'Cada flujo corre cuando se registra un nuevo socio. Conecta nodos desde Inicio; las ramas salen de «Condición». Puedes arrastrar los pasos y borrar conexiones con la tecla Supr o el menú del lienzo.',
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
        <WorkflowFlowEditor
          key={editorSession}
          equipos={equipos}
          initialNombre={initialNombre}
          initialDescripcion={initialDescripcion}
          initialPasos={initialPasos}
          editingId={editingId}
          onClose={() => setEditorOpen(false)}
          onSave={handleSaveFromEditor}
          saveBusy={saveBusy}
        />
      )}
    </div>
  )
}

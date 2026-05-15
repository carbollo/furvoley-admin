'use client'

import { useCallback, useRef, useState, type ChangeEvent } from 'react'
import { Zap, Plus, Download, Upload } from 'lucide-react'
import { workflowTriggerLabel } from '@/lib/crm-workflow-triggers'
import { isWorkflowTriggerAllowed } from '@/lib/crm-workflow-triggers'
import { isWorkflowActionAllowed } from '@/lib/crm-workflow-actions'
import { WorkflowFlowEditor, type WorkflowEditorInitialPaso } from './WorkflowFlowEditor'

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
type SerializableWorkflow = {
  name: string
  description: string | null
  triggerType: string
  isActive: boolean
  steps: Array<{
    position: number
    stepType: string
    actionType: string
    config: Record<string, unknown>
  }>
}

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
  const [initialTriggerType, setInitialTriggerType] = useState('MEMBER_CREATED')
  const [saveBusy, setSaveBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const activos = wfs.filter((w) => w.activo).length
  const totalPasos = wfs.reduce((a, w) => a + ((w.pasos as unknown[])?.length ?? 0), 0)

  const triggerColors: Record<string, string> = { MEMBER_CREATED: '#10B981', MEMBER_UPDATED: '#0EA5E9' }
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
    setInitialTriggerType('MEMBER_CREATED')
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
    setInitialTriggerType(String(w.trigger || 'MEMBER_CREATED'))
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
    triggerType: string
    steps: Array<{ position: number; stepType: string; actionType: string; config: Record<string, unknown> }>
  }) => {
    setSaveBusy(true)
    try {
      const body = {
        name: payload.name,
        description: payload.description,
        triggerType: payload.triggerType,
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

  const buildExportPayload = (): SerializableWorkflow[] => {
    return wfs.map((w) => {
      const pasos = Array.isArray(w.pasos) ? (w.pasos as Record<string, unknown>[]) : []
      return {
        name: String(w.nombre || ''),
        description: String(w.descripcion || '').trim() || null,
        triggerType: String(w.trigger || 'MEMBER_CREATED'),
        isActive: !!w.activo,
        steps: pasos.map((p, i) => ({
          position: typeof p.position === 'number' ? p.position : i,
          stepType: String(p.stepType || 'ACTION'),
          actionType: String(p.actionType || ''),
          config:
            p.config && typeof p.config === 'object' && !Array.isArray(p.config)
              ? (p.config as Record<string, unknown>)
              : {},
        })),
      }
    })
  }

  const exportWorkflows = () => {
    const payload = {
      format: 'furvoley-workflows',
      version: 1,
      exportedAt: new Date().toISOString(),
      workflows: buildExportPayload(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    a.href = url
    a.download = `furvoley-workflows-${stamp}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function normalizeImportedWorkflows(input: unknown): SerializableWorkflow[] {
    const rawList =
      Array.isArray(input)
        ? input
        : input && typeof input === 'object' && Array.isArray((input as Record<string, unknown>).workflows)
          ? ((input as Record<string, unknown>).workflows as unknown[])
          : []
    return rawList
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const o = item as Record<string, unknown>
        const triggerType = String(o.triggerType || 'MEMBER_CREATED')
        if (!isWorkflowTriggerAllowed(triggerType)) return null
        const stepsRaw = Array.isArray(o.steps) ? (o.steps as Record<string, unknown>[]) : []
        const steps = stepsRaw
          .map((s, i) => {
            const actionType = String(s.actionType || '')
            if (!isWorkflowActionAllowed(actionType)) return null
            return {
              position: typeof s.position === 'number' ? s.position : i,
              stepType: String(s.stepType || 'ACTION'),
              actionType,
              config:
                s.config && typeof s.config === 'object' && !Array.isArray(s.config)
                  ? (s.config as Record<string, unknown>)
                  : {},
            }
          })
          .filter((x): x is SerializableWorkflow['steps'][number] => !!x)
        const name = String(o.name || '').trim()
        if (!name) return null
        return {
          name,
          description: String(o.description || '').trim() || null,
          triggerType,
          isActive: o.isActive !== false,
          steps,
        } satisfies SerializableWorkflow
      })
      .filter((x): x is SerializableWorkflow => !!x)
  }

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    setImportBusy(true)
    try {
      const text = await file.text()
      let parsed: unknown = null
      try {
        parsed = JSON.parse(text)
      } catch {
        alert('El archivo no es un JSON válido.')
        return
      }
      const workflows = normalizeImportedWorkflows(parsed)
      if (workflows.length === 0) {
        alert('No se encontraron flujos válidos para importar.')
        return
      }

      let okCount = 0
      const errors: string[] = []
      for (const wf of workflows) {
        const r = await fetch('/api/crm/workflows', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wf),
        })
        if (r.ok) {
          okCount++
        } else {
          let msg = `Error al importar "${wf.name}"`
          try {
            const j = await r.json()
            msg = j.error || msg
          } catch {
            //
          }
          errors.push(msg)
        }
      }
      await reload()
      if (errors.length > 0) {
        alert(`Importados: ${okCount}. Errores: ${errors.length}.\n${errors.slice(0, 3).join('\n')}`)
      } else {
        alert(`Importación completada. Flujos importados: ${okCount}.`)
      }
    } finally {
      setImportBusy(false)
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
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={onImportFile}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={exportWorkflows}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: '#fff',
              color: '#374151',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Download size={16} /> Exportar JSON
          </button>
          <button
            type="button"
            disabled={importBusy}
            onClick={() => importInputRef.current?.click()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: '#fff',
              color: '#374151',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              cursor: importBusy ? 'not-allowed' : 'pointer',
              opacity: importBusy ? 0.7 : 1,
            }}
          >
            <Upload size={16} /> {importBusy ? 'Importando…' : 'Importar JSON'}
          </button>
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
                      ⚡ {workflowTriggerLabel(String(w.trigger))}
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
          triggerType={initialTriggerType}
          editingId={editingId}
          onClose={() => setEditorOpen(false)}
          onSave={handleSaveFromEditor}
          saveBusy={saveBusy}
        />
      )}
    </div>
  )
}

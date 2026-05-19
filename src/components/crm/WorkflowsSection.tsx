'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Zap, Plus, Download, Upload, BookOpen, X } from 'lucide-react'
import { workflowTriggerLabel } from '@/lib/crm-workflow-triggers'
import { parseWorkflowsFromJson } from '@/lib/workflow-import'
import { WorkflowFlowEditor, type WorkflowEditorInitialPaso } from './WorkflowFlowEditor'

type CatalogTemplate = {
  id: string
  name: string
  description: string | null
  triggerType: string
  stepCount: number
  createdAt: string
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

  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catalogTemplates, setCatalogTemplates] = useState<CatalogTemplate[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogUploadBusy, setCatalogUploadBusy] = useState(false)
  const [catalogInstalling, setCatalogInstalling] = useState<string | null>(null)
  const [catalogSaving, setCatalogSaving] = useState<string | null>(null)
  const catalogUploadRef = useRef<HTMLInputElement | null>(null)

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

  const exportWorkflows = (onlyWorkflow?: Record<string, unknown>) => {
    const selectedName = onlyWorkflow ? String(onlyWorkflow.nombre || 'flujo') : ''
    const selectedPayload = onlyWorkflow
      ? (() => {
          const pasos = Array.isArray(onlyWorkflow.pasos) ? (onlyWorkflow.pasos as Record<string, unknown>[]) : []
          return [
            {
              name: String(onlyWorkflow.nombre || ''),
              description: String(onlyWorkflow.descripcion || '').trim() || null,
              triggerType: String(onlyWorkflow.trigger || 'MEMBER_CREATED'),
              isActive: !!onlyWorkflow.activo,
              steps: pasos.map((p, i) => ({
                position: typeof p.position === 'number' ? p.position : i,
                stepType: String(p.stepType || 'ACTION'),
                actionType: String(p.actionType || ''),
                config:
                  p.config && typeof p.config === 'object' && !Array.isArray(p.config)
                    ? (p.config as Record<string, unknown>)
                    : {},
              })),
            },
          ]
        })()
      : buildExportPayload()
    const payload = {
      format: 'furvoley-workflows',
      version: 1,
      exportedAt: new Date().toISOString(),
      workflows: selectedPayload,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    a.href = url
    const safeName = selectedName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
    a.download = onlyWorkflow
      ? `furvoley-workflow-${safeName || 'seleccionado'}-${stamp}.json`
      : `furvoley-workflows-${stamp}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    try {
      const r = await fetch('/api/crm/workflows/template-catalog', { credentials: 'include' })
      if (!r.ok) {
        setCatalogTemplates([])
        return
      }
      const j = await r.json()
      setCatalogTemplates(Array.isArray(j.templates) ? j.templates : [])
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    if (catalogOpen) void loadCatalog()
  }, [catalogOpen, loadCatalog])

  const installFromCatalog = async (templateId: string) => {
    setCatalogInstalling(templateId)
    try {
      const r = await fetch(`/api/crm/workflows/template-catalog/${templateId}/install`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!r.ok) {
        let msg = 'No se pudo instalar la plantilla'
        try {
          msg = (await r.json()).error || msg
        } catch {
          //
        }
        alert(msg)
        return
      }
      await reload()
      setCatalogOpen(false)
    } finally {
      setCatalogInstalling(null)
    }
  }

  const deleteFromCatalog = async (templateId: string, name: string) => {
    if (!confirm(`¿Quitar «${name}» de la biblioteca?`)) return
    const r = await fetch(`/api/crm/workflows/template-catalog/${templateId}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!r.ok) {
      alert('No se pudo eliminar la plantilla')
      return
    }
    await loadCatalog()
  }

  const saveWorkflowToCatalog = async (workflowId: string) => {
    setCatalogSaving(workflowId)
    try {
      const r = await fetch('/api/crm/workflows/template-catalog', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId }),
      })
      if (!r.ok) {
        let msg = 'No se pudo guardar en la biblioteca'
        try {
          msg = (await r.json()).error || msg
        } catch {
          //
        }
        alert(msg)
        return
      }
      if (catalogOpen) await loadCatalog()
      else alert('Plantilla guardada en la biblioteca.')
    } finally {
      setCatalogSaving(null)
    }
  }

  const onCatalogUploadFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    setCatalogUploadBusy(true)
    try {
      let parsed: unknown
      try {
        parsed = JSON.parse(await file.text())
      } catch {
        alert('El archivo no es un JSON válido.')
        return
      }
      const workflows = parseWorkflowsFromJson(parsed)
      if (workflows.length === 0) {
        alert('No se encontraron flujos válidos. Exporta un flujo desde Furvoley e impórtalo aquí.')
        return
      }
      const r = await fetch('/api/crm/workflows/template-catalog', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: parsed }),
      })
      if (!r.ok) {
        let msg = 'No se pudo subir a la biblioteca'
        try {
          msg = (await r.json()).error || msg
        } catch {
          //
        }
        alert(msg)
        return
      }
      const j = await r.json()
      const n = Array.isArray(j.created) ? j.created.length : workflows.length
      alert(`Se añadieron ${n} plantilla(s) a la biblioteca.`)
      await loadCatalog()
    } finally {
      setCatalogUploadBusy(false)
    }
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
      const workflows = parseWorkflowsFromJson(parsed)
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
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 40px 56px', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
            Flujos de trabajo
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 6, margin: 0 }}>
            {activos} de {wfs.length || 0} activos · Se ejecutan según el disparador configurado
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
          <input
            ref={catalogUploadRef}
            type="file"
            accept=".json,application/json"
            onChange={onCatalogUploadFile}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => setCatalogOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 8,
              border: '1px solid var(--border-strong)', background: 'var(--surface-card)',
              color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-low)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-card)' }}
          >
            <BookOpen size={15} /> Biblioteca de plantillas
          </button>
          <button
            type="button"
            onClick={() => exportWorkflows()}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 8,
              border: '1px solid var(--border-strong)', background: 'var(--surface-card)',
              color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-low)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-card)' }}
          >
            <Download size={15} /> Exportar JSON
          </button>
          <button
            type="button"
            disabled={importBusy}
            onClick={() => importInputRef.current?.click()}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 8,
              border: '1px solid var(--border-strong)', background: 'var(--surface-card)',
              color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              cursor: importBusy ? 'not-allowed' : 'pointer', opacity: importBusy ? 0.7 : 1,
            }}
          >
            <Upload size={15} /> {importBusy ? 'Importando…' : 'Importar JSON'}
          </button>
          <button
            type="button"
            onClick={openNuevo}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 8, border: 'none',
              cursor: 'pointer', background: 'var(--accent)', color: '#fff',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              boxShadow: '0 1px 2px rgba(0,74,198,0.2)', transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
          >
            <Plus size={15} strokeWidth={2.5} />
            Nuevo flujo
          </button>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
        {[
          { label: 'Flujos configurados', value: String(wfs.length), color: 'var(--accent-soft)', sub: 'En el sistema', badge: { kind: 'info' as const, text: 'Total' } },
          { label: 'Activos', value: String(activos), color: 'var(--green)', sub: 'En ejecución', badge: { kind: 'success' as const, text: 'Activos' } },
          { label: 'Pasos totales', value: String(totalPasos), color: 'var(--amber)', sub: 'Suma de acciones', badge: null },
        ].map(({ label, value, color, sub, badge }) => (
          <div
            key={label}
            style={{
              background: 'var(--surface-card)', borderRadius: 12, padding: 24,
              boxShadow: 'var(--card-shadow)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `color-mix(in srgb, ${color} 15%, transparent)`, color,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Zap size={20} />
              </div>
              {badge && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999,
                  background: badge.kind === 'success' ? 'var(--green-soft)' : 'var(--accent-pill)',
                  color: badge.kind === 'success' ? 'var(--green)' : 'var(--accent)',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.02em'
                }}>{badge.text}</span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
              <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {wfs.length === 0 && (
          <div
            style={{
              background: 'var(--surface-card)',
              borderRadius: 12,
              padding: '48px 24px',
              textAlign: 'center',
              border: '1px dashed var(--border-strong)',
              color: 'var(--text-muted)',
              fontSize: 14,
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
                    disabled={catalogSaving === String(w.id)}
                    onClick={() => saveWorkflowToCatalog(String(w.id))}
                    title="Guardar copia en la biblioteca de plantillas"
                    style={{
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: '#fff',
                      cursor: catalogSaving === String(w.id) ? 'wait' : 'pointer',
                      color: '#374151',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 600,
                      opacity: catalogSaving === String(w.id) ? 0.7 : 1,
                    }}
                  >
                    {catalogSaving === String(w.id) ? '…' : 'A biblioteca'}
                  </button>
                  <button
                    type="button"
                    onClick={() => exportWorkflows(w)}
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
                    Exportar
                  </button>
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

      {catalogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setCatalogOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(960px, 100%)',
              maxHeight: '85vh',
              background: 'var(--surface-card)',
              borderRadius: 16,
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div>
                <strong style={{ fontSize: 18 }}>Biblioteca de plantillas</strong>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Sube JSON exportado o guarda un flujo con «A biblioteca». Instala cuando quieras usarlo.
                </p>
              </div>
              <button type="button" onClick={() => setCatalogOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={catalogUploadBusy}
                onClick={() => catalogUploadRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: 'var(--accent)', color: '#fff',
                  fontWeight: 600, fontSize: 13, cursor: catalogUploadBusy ? 'wait' : 'pointer',
                  opacity: catalogUploadBusy ? 0.8 : 1,
                }}
              >
                <Upload size={14} />
                {catalogUploadBusy ? 'Subiendo…' : 'Subir plantilla (JSON)'}
              </button>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              {catalogLoading ? (
                <p style={{ padding: 24, textAlign: 'center' }}>Cargando…</p>
              ) : catalogTemplates.length === 0 ? (
                <p style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  No hay plantillas. Sube un JSON o guarda un flujo existente con «A biblioteca».
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-low)' }}>
                      <th style={{ padding: 10, textAlign: 'left' }}>Nombre</th>
                      <th style={{ padding: 10, textAlign: 'left' }}>Disparador</th>
                      <th style={{ padding: 10, textAlign: 'left' }}>Pasos</th>
                      <th style={{ padding: 10 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {catalogTemplates.map((t) => (
                      <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 600 }}>{t.name}</div>
                          {t.description ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t.description}</div>
                          ) : null}
                        </td>
                        <td style={{ padding: 10 }}>{workflowTriggerLabel(t.triggerType)}</td>
                        <td style={{ padding: 10 }}>{t.stepCount}</td>
                        <td style={{ padding: 10, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            disabled={catalogInstalling === t.id}
                            onClick={() => installFromCatalog(t.id)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: 'none',
                              background: 'var(--accent)',
                              color: '#fff',
                              fontWeight: 600,
                              cursor: 'pointer',
                              marginRight: 8,
                            }}
                          >
                            {catalogInstalling === t.id ? '…' : 'Instalar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteFromCatalog(t.id, t.name)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: '1px solid #fecaca',
                              background: '#fff',
                              color: '#b91c1c',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

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
    </div>
  )
}
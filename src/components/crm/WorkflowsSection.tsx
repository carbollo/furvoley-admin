'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Zap, Plus, Download, Upload, BookOpen, X, Play, Search } from 'lucide-react'
import { WORKFLOW_ACTION_OPTIONS } from '@/lib/crm-workflow-actions'
import { workflowTriggerLabel } from '@/lib/crm-workflow-triggers'
import { track } from '@/lib/analytics/umami'
import { parseWorkflowsFromJson } from '@/lib/workflow-import'
import { WorkflowFlowEditor, type WorkflowEditorInitialPaso } from './WorkflowFlowEditor'
import { MemberCombobox } from './MemberCombobox'

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
      return `Asignar → ${eq(c.groupId) || 'equipo…'}`
    case 'ASSIGN_TEAM_BY_AGE': {
      const r = [c.minAge, c.maxAge].filter((x) => x !== '' && x != null).join('–')
      return `Por edad (${r || '…'}) → ${eq(c.groupId)}`
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
type BundleSocio = { id: string; nombre: string; telefono?: string; estado?: string }

type WorkflowTestStepReport = {
  position: number
  stepKey: string
  actionType: string
  applied: boolean
  branchResult?: string
  error?: string
}

type WorkflowTestApiResult = {
  ok: boolean
  workflowName: string
  triggerLabel: string
  subjectName: string
  subjectKind: string
  stepsRun: number
  reports: WorkflowTestStepReport[]
  warnings: string[]
  error?: string
}
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
  const registrationFields = Array.isArray(
    (bundle?.club as { registrationFields?: unknown } | undefined)?.registrationFields,
  )
    ? ((bundle?.club as { registrationFields: import('@/lib/registration-fields').RegistrationFieldDef[] })
        .registrationFields)
    : undefined

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
  const [initialTriggerConfig, setInitialTriggerConfig] = useState<Record<string, unknown> | null>(null)
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

  type ProclubEntry = {
    catalogId: string
    name: string
    area: string
    automation: string
    phase: number
    triggerType: string
    stepCount: number
    installed: boolean
    workflowId: string | null
  }
  const [proclubOpen, setProclubOpen] = useState(false)
  const [proclubEntries, setProclubEntries] = useState<ProclubEntry[]>([])
  const [proclubLoading, setProclubLoading] = useState(false)
  const [proclubInstalling, setProclubInstalling] = useState(false)
  const [proclubSelected, setProclubSelected] = useState<Set<string>>(new Set())

  const [testOpen, setTestOpen] = useState(false)
  const [testWorkflowId, setTestWorkflowId] = useState<string | null>(null)
  const [testWorkflowName, setTestWorkflowName] = useState('')
  const [testTriggerLabel, setTestTriggerLabel] = useState('')
  const [testMemberId, setTestMemberId] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testResult, setTestResult] = useState<WorkflowTestApiResult | null>(null)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const filteredWfs = useMemo(() => {
    const q = searchDebounced.trim().toLowerCase()
    if (!q) return wfs
    return wfs.filter((w) => {
      const nombre = String(w.nombre || '').toLowerCase()
      const descripcion = String(w.descripcion || '').toLowerCase()
      const trigger = String(w.trigger || '').toLowerCase()
      const triggerLabel = workflowTriggerLabel(String(w.trigger || '')).toLowerCase()
      const pasos = (w.pasos as Record<string, unknown>[]) || []
      const pasosText = pasos
        .map((p) => {
          const action = WORKFLOW_ACTION_OPTIONS.find((o) => o.value === String(p.actionType))
          return [String(p.actionType || ''), action?.label || ''].join(' ')
        })
        .join(' ')
        .toLowerCase()
      const estado = w.activo ? 'activo' : 'pausado'
      return [nombre, descripcion, trigger, triggerLabel, pasosText, estado].some((s) => s.includes(q))
    })
  }, [wfs, searchDebounced])

  const activos = wfs.filter((w) => w.activo).length
  const totalPasos = wfs.reduce((a, w) => a + ((w.pasos as unknown[])?.length ?? 0), 0)

  const triggerColors: Record<string, string> = { MEMBER_CREATED: '#10B981', MEMBER_UPDATED: '#0EA5E9' }
  const colorTrig = (t: string) => triggerColors[t] || '#78716c'

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
    setInitialTriggerConfig(null)
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
    const tc = w.triggerConfig
    setInitialTriggerConfig(
      tc && typeof tc === 'object' && !Array.isArray(tc) ? (tc as Record<string, unknown>) : null,
    )
    setEditorSession((s) => s + 1)
    setEditorOpen(true)
  }

  const actionLabel = (actionType: string) =>
    WORKFLOW_ACTION_OPTIONS.find((a) => a.value === actionType)?.label ?? actionType

  const openTest = (w: Record<string, unknown>) => {
    setTestWorkflowId(String(w.id))
    setTestWorkflowName(String(w.nombre || ''))
    setTestTriggerLabel(workflowTriggerLabel(String(w.trigger || 'MEMBER_CREATED')))
    setTestMemberId('')
    setTestResult(null)
    setTestOpen(true)
  }

  const runTest = async () => {
    if (!testWorkflowId) return
    setTestBusy(true)
    setTestResult(null)
    try {
      const r = await fetch(`/api/crm/workflows/${testWorkflowId}/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testMemberId ? { memberId: testMemberId } : {}),
      })
      const data = (await r.json()) as WorkflowTestApiResult & { error?: string }
      if (!r.ok && !data.reports) {
        alert(data.error || 'No se pudo ejecutar la prueba')
        return
      }
      setTestResult(data)
    } catch {
      alert('Error de red al probar el flujo')
    } finally {
      setTestBusy(false)
    }
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
    triggerConfig: Record<string, unknown> | null
    steps: Array<{ position: number; stepType: string; actionType: string; config: Record<string, unknown> }>
  }) => {
    setSaveBusy(true)
    try {
      const body = {
        name: payload.name,
        description: payload.description,
        triggerType: payload.triggerType,
        triggerConfig: payload.triggerConfig,
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
      track('guardar-workflow', { editar: !!editingId })
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

  const loadProclubCatalog = useCallback(async () => {
    setProclubLoading(true)
    try {
      const r = await fetch('/api/crm/workflows/proclub-catalog', { credentials: 'include' })
      if (!r.ok) {
        setProclubEntries([])
        return
      }
      const j = await r.json()
      setProclubEntries(Array.isArray(j.entries) ? j.entries : [])
    } finally {
      setProclubLoading(false)
    }
  }, [])

  useEffect(() => {
    if (proclubOpen) void loadProclubCatalog()
  }, [proclubOpen, loadProclubCatalog])

  const installProclub = async (installAll: boolean) => {
    setProclubInstalling(true)
    try {
      const ids = installAll ? undefined : [...proclubSelected]
      const r = await fetch('/api/crm/workflows/proclub-catalog/install', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(installAll ? { installAll: true } : { ids }),
      })
      if (!r.ok) {
        alert('No se pudo instalar la biblioteca PROCLUB')
        return
      }
      const j = await r.json()
      alert(
        `PROCLUB: ${j.installed ?? 0} nuevos, ${j.updated ?? 0} actualizados` +
          (j.skipped ? `, ${j.skipped} omitidos` : ''),
      )
      await reload()
      await loadProclubCatalog()
      setProclubOpen(false)
    } finally {
      setProclubInstalling(false)
    }
  }

  useEffect(() => {
    void fetch('/api/crm/workflows/ensure-defaults', {
      method: 'POST',
      credentials: 'include',
    }).then((r) => {
      if (r.ok) void reload()
    })
    // Solo al montar la sección: instala WD-1 si falta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        alert('No se encontraron flujos válidos. Exporta un flujo desde ProClubCRM e impórtalo aquí.')
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
            onClick={() => setProclubOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 8,
              border: '1px solid var(--accent)',
              cursor: 'pointer', background: 'var(--accent-pill)', color: 'var(--accent)',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
            }}
          >
            <BookOpen size={15} /> Biblioteca PROCLUB
          </button>
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

      <div style={{ position: 'relative', maxWidth: 480 }}>
        <span
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
            pointerEvents: 'none',
            display: 'flex',
          }}
        >
          <Search size={16} />
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar flujos por nombre, disparador o acción…"
          style={{
            width: '100%',
            padding: '10px 12px 10px 38px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            fontFamily: 'inherit',
            fontSize: 14,
            background: 'var(--surface-card)',
            outline: 'none',
            color: 'var(--text-primary)',
            boxSizing: 'border-box',
          }}
        />
        {searchDebounced.trim() ? (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            {filteredWfs.length} de {wfs.length} flujos
          </p>
        ) : null}
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
        {wfs.length > 0 && filteredWfs.length === 0 && (
          <div
            style={{
              background: 'var(--surface-card)',
              borderRadius: 12,
              padding: '32px 24px',
              textAlign: 'center',
              border: '1px dashed var(--border-strong)',
              color: 'var(--text-muted)',
              fontSize: 14,
            }}
          >
            No hay flujos que coincidan con «{searchDebounced.trim()}».
          </div>
        )}
        {filteredWfs.map((w) => {
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
                    background: w.activo ? 'var(--accent-light)' : '#f4efe8',
                    color: w.activo ? 'var(--accent)' : '#a8a29e',
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
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1c1917' }}>{String(w.nombre)}</div>
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
                          background: '#f4efe8',
                          color: '#a8a29e',
                        }}
                      >
                        Pausado
                      </span>
                    )}
                  </div>
                  {w.descripcion ? (
                    <p style={{ fontSize: 13, color: '#8c857d', margin: '0 0 8px', lineHeight: 1.45 }}>
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
                    <span style={{ color: '#a8a29e', fontSize: 12 }}>→</span>
                    <span style={{ fontSize: 12, color: '#44403c', fontWeight: 500 }}>{resumen}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#a8a29e', marginTop: 8 }}>
                    {pasos.length} paso{pasos.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={pasos.length === 0}
                    onClick={() => openTest(w)}
                    title="Simular el disparador y ejecutar el flujo"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: '1px solid #a7f3d0',
                      background: '#ecfdf5',
                      cursor: pasos.length === 0 ? 'not-allowed' : 'pointer',
                      color: '#047857',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 600,
                      opacity: pasos.length === 0 ? 0.5 : 1,
                    }}
                  >
                    <Play size={14} />
                    Probar
                  </button>
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
                      color: '#44403c',
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
                      color: '#44403c',
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
                      color: '#44403c',
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
                      background: w.activo ? 'var(--green)' : '#d8cdbd',
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

      {testOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => !testBusy && setTestOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(520px, 100%)',
              maxHeight: '85vh',
              overflow: 'auto',
              background: 'var(--surface-card)',
              borderRadius: 16,
              border: '1px solid var(--border)',
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div>
                <strong style={{ fontSize: 17 }}>Probar flujo</strong>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {testWorkflowName} · {testTriggerLabel}
                </p>
              </div>
              <button
                type="button"
                disabled={testBusy}
                onClick={() => setTestOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <p
              style={{
                fontSize: 12,
                color: '#b45309',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 10,
                padding: '10px 12px',
                margin: '0 0 14px',
                lineHeight: 1.45,
              }}
            >
              Simula el disparador y ejecuta los pasos de verdad (WhatsApp, asignaciones, cobros…). Elige un socio de
              prueba o déjalo vacío para usar el primero activo del club.
            </p>

            <MemberCombobox
              label="Socio de prueba (opcional)"
              value={testMemberId}
              onChange={(memberId) => setTestMemberId(memberId)}
              placeholder="Automático si no eliges socio…"
              disabled={testBusy}
              style={{ marginBottom: 14 }}
            />

            {testResult && (
              <div
                style={{
                  marginBottom: 14,
                  padding: 12,
                  borderRadius: 10,
                  border: `1px solid ${testResult.ok ? '#6ee7b7' : '#fecaca'}`,
                  background: testResult.ok ? '#ecfdf5' : '#fef2f2',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 700, color: testResult.ok ? '#047857' : '#b91c1c', marginBottom: 8 }}>
                  {testResult.ok ? 'Prueba completada' : 'Prueba con incidencias'}
                  {testResult.error ? ` — ${testResult.error}` : ''}
                </div>
                <div style={{ color: '#44403c' }}>
                  Sujeto: <strong>{testResult.subjectName}</strong> ({testResult.subjectKind === 'lead' ? 'lead' : 'socio'})
                  · {testResult.stepsRun} paso(s)
                </div>
                {testResult.warnings?.length > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#78716c' }}>
                    {testResult.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                {testResult.reports?.length > 0 && (
                  <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
                    {testResult.reports.map((r) => (
                      <li
                        key={`${r.stepKey}-${r.position}`}
                        style={{
                          padding: '6px 0',
                          borderTop: '1px solid rgba(0,0,0,0.06)',
                          color: r.error ? '#b91c1c' : r.applied ? '#047857' : '#78716c',
                        }}
                      >
                        {actionLabel(r.actionType)}
                        {r.branchResult ? ` → rama ${r.branchResult}` : ''}
                        {r.applied ? ' ✓' : ' —'}
                        {r.error ? ` · ${r.error}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={testBusy}
                onClick={() => setTestOpen(false)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={testBusy}
                onClick={runTest}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#059669',
                  color: '#fff',
                  cursor: testBusy ? 'wait' : 'pointer',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                <Play size={15} />
                {testBusy ? 'Ejecutando…' : testResult ? 'Repetir prueba' : 'Ejecutar prueba'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {proclubOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 85,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setProclubOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(1100px, 100%)',
              maxHeight: '88vh',
              background: 'var(--surface-card)',
              borderRadius: 16,
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <strong style={{ fontSize: 18 }}>Biblioteca PROCLUB</strong>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  48 workflows del esquema PROCLUB. Instala y configura cada flujo (planId, groupId, edades).
                  Guía: <code>docs/proclub-workflows-guide.md</code>
                </p>
              </div>
              <button type="button" onClick={() => setProclubOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={proclubInstalling}
                onClick={() => void installProclub(true)}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                {proclubInstalling ? 'Instalando…' : 'Instalar todo'}
              </button>
              <button
                type="button"
                disabled={proclubInstalling || proclubSelected.size === 0}
                onClick={() => void installProclub(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontWeight: 600, cursor: 'pointer' }}
              >
                Instalar seleccionados ({proclubSelected.size})
              </button>
            </div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              {proclubLoading ? (
                <p style={{ padding: 24, textAlign: 'center' }}>Cargando catálogo…</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-low)' }}>
                      <th style={{ padding: 8 }} />
                      <th style={{ padding: 8, textAlign: 'left' }}>ID</th>
                      <th style={{ padding: 8, textAlign: 'left' }}>Nombre</th>
                      <th style={{ padding: 8 }}>Fase</th>
                      <th style={{ padding: 8 }}>Área</th>
                      <th style={{ padding: 8 }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proclubEntries.map((e) => (
                      <tr key={e.catalogId} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 8 }}>
                          {e.automation !== 'manual' && (
                            <input
                              type="checkbox"
                              checked={proclubSelected.has(e.catalogId)}
                              onChange={(ev) => {
                                setProclubSelected((prev) => {
                                  const next = new Set(prev)
                                  if (ev.target.checked) next.add(e.catalogId)
                                  else next.delete(e.catalogId)
                                  return next
                                })
                              }}
                            />
                          )}
                        </td>
                        <td style={{ padding: 8, fontWeight: 700 }}>{e.catalogId}</td>
                        <td style={{ padding: 8 }}>{e.name.replace(/^[A-Z]+-\d+ · /, '')}</td>
                        <td style={{ padding: 8 }}>{e.phase}</td>
                        <td style={{ padding: 8 }}>{e.area}</td>
                        <td style={{ padding: 8 }}>
                          {e.automation === 'manual' ? (
                            <span style={{ color: '#78716c' }}>Manual</span>
                          ) : e.installed ? (
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>Instalado</span>
                          ) : (
                            <span style={{ color: '#d97706' }}>Pendiente</span>
                          )}
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
          registrationFields={registrationFields}
          initialNombre={initialNombre}
          initialDescripcion={initialDescripcion}
          initialPasos={initialPasos}
          triggerType={initialTriggerType}
          initialTriggerConfig={initialTriggerConfig}
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
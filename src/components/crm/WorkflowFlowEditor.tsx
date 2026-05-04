'use client'

import { useCallback, useEffect, useMemo, useState, memo, type CSSProperties } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  Panel,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, Trash2 } from 'lucide-react'
import {
  WORKFLOW_START_ID,
  emptyFlow,
  flowToPasos,
  newWorkflowNode,
  shortActionLabel,
  stepsToFlowNodes,
  type WorkflowNodeData,
} from './workflow-graph'

const ACCIONES = [
  { value: 'ASSIGN_TEAM', label: 'Asignar a un equipo' },
  { value: 'ASSIGN_TEAM_BY_AGE', label: 'Asignar por rango de edad' },
  { value: 'SET_MEMBER_STATUS', label: 'Cambiar estado del socio' },
  { value: 'CREATE_PAYMENT', label: 'Registrar cobro (cuota)' },
  { value: 'HTTP_REQUEST', label: 'Petición HTTP' },
  { value: 'BRANCH_IF', label: 'Condición (ramificar)' },
] as const

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

const inputBase: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.09)',
  fontFamily: 'inherit',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelBase: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#64748b',
  marginBottom: 6,
  display: 'block',
}

const startBar: CSSProperties = {
  padding: '12px 20px',
  borderRadius: 12,
  background: '#111827',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  minWidth: 100,
  textAlign: 'center',
  boxShadow: 'var(--card-shadow, 0 1px 3px rgba(0,0,0,0.08))',
}

const stepBox = (selected: boolean): CSSProperties => ({
  position: 'relative',
  padding: '12px 16px',
  borderRadius: 14,
  background: '#fff',
  border: `2px solid ${selected ? 'var(--accent, #6366f1)' : 'var(--border, #e5e7eb)'}`,
  minWidth: 160,
  maxWidth: 220,
  boxShadow: 'var(--card-shadow, 0 1px 3px rgba(0,0,0,0.06))',
})

const WorkflowStartNode = memo(function WorkflowStartNode() {
  return (
    <div style={startBar}>
      Inicio
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: '#64748b', width: 10, height: 10, border: '2px solid #fff' }}
      />
    </div>
  )
})

const WorkflowStepNode = memo(function WorkflowStepNode({ id, data, selected }: NodeProps<Node<WorkflowNodeData>>) {
  const isBranch = data.actionType === 'BRANCH_IF'
  return (
    <div style={stepBox(selected)}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: '#94a3b8', width: 10, height: 10, border: '2px solid #fff' }}
      />
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>{data.label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', lineHeight: 1.3, wordBreak: 'break-word' }}>
        {ACCIONES.find((a) => a.value === data.actionType)?.label ?? data.actionType}
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, fontFamily: 'monospace' }}>{data.stepKey}</div>
      {isBranch ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="then"
            style={{
              top: '35%',
              background: '#10b981',
              width: 10,
              height: 10,
              border: '2px solid #fff',
            }}
          />
          <span style={{ position: 'absolute', right: -48, top: '28%', fontSize: 10, color: '#059669', fontWeight: 600 }}>
            Sí
          </span>
          <Handle
            type="source"
            position={Position.Right}
            id="else"
            style={{
              top: '65%',
              background: '#f59e0b',
              width: 10,
              height: 10,
              border: '2px solid #fff',
            }}
          />
          <span style={{ position: 'absolute', right: -52, top: '58%', fontSize: 10, color: '#d97706', fontWeight: 600 }}>
            No
          </span>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id="next"
          style={{ background: 'var(--accent, #6366f1)', width: 10, height: 10, border: '2px solid #fff' }}
        />
      )}
    </div>
  )
})

const nodeTypes = { workflowStart: WorkflowStartNode, workflowStep: WorkflowStepNode }

type BundleEquip = { id: string; nombre: string }

export type WorkflowEditorInitialPaso = {
  position: number
  stepType: string
  actionType: string
  config: unknown
}

export function WorkflowFlowEditor(props: {
  equipos: BundleEquip[]
  initialNombre: string
  initialDescripcion: string
  initialPasos: WorkflowEditorInitialPaso[]
  editingId: string | null
  onClose: () => void
  onSave: (payload: {
    name: string
    description: string | null
    steps: Array<{ position: number; stepType: string; actionType: string; config: Record<string, unknown> }>
  }) => void
  saveBusy: boolean
}) {
  return (
    <ReactFlowProvider>
      <WorkflowFlowEditorInner {...props} />
    </ReactFlowProvider>
  )
}

function WorkflowFlowEditorInner({
  equipos,
  initialNombre,
  initialDescripcion,
  initialPasos,
  editingId,
  onClose,
  onSave,
  saveBusy,
}: {
  equipos: BundleEquip[]
  initialNombre: string
  initialDescripcion: string
  initialPasos: WorkflowEditorInitialPaso[]
  editingId: string | null
  onClose: () => void
  onSave: (payload: {
    name: string
    description: string | null
    steps: Array<{ position: number; stepType: string; actionType: string; config: Record<string, unknown> }>
  }) => void
  saveBusy: boolean
}) {
  const [nombre, setNombre] = useState(initialNombre)
  const [descripcion, setDescripcion] = useState(initialDescripcion)

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => (initialPasos.length ? stepsToFlowNodes(initialPasos) : emptyFlow()),
    [initialPasos],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    setNombre(initialNombre)
    setDescripcion(initialDescripcion)
    const { nodes: n, edges: e } = initialPasos.length ? stepsToFlowNodes(initialPasos) : emptyFlow()
    setNodes(n)
    setEdges(e)
    setSelectedId(null)
  }, [initialPasos, initialNombre, initialDescripcion, setNodes, setEdges])

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId && n.type === 'workflowStep') as Node<WorkflowNodeData> | undefined,
    [nodes, selectedId],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            style: { stroke: 'var(--accent, #6366f1)', strokeWidth: 2 },
            animated: true,
          },
          eds,
        ),
      )
    },
    [setEdges],
  )

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      const t = connection.target
      const th = connection.targetHandle ?? null
      if (th === 'in') {
        const existing = edges.some((e) => e.target === t && (e.targetHandle ?? null) === 'in')
        if (existing) return false
      }
      return true
    },
    [edges],
  )

  const onSelectionChange = useCallback(
    ({ nodes: sel }: { nodes: Node[] }) => {
      const first = sel[0]
      setSelectedId(first?.type === 'workflowStep' ? first.id : null)
    },
    [],
  )

  const updateSelectedData = useCallback(
    (patch: Partial<WorkflowNodeData>) => {
      if (!selectedId) return
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== selectedId || n.type !== 'workflowStep') return n
          const d = n.data as WorkflowNodeData
          const nextData = { ...d, ...patch }
          if (patch.config) {
            nextData.config = patch.config
            nextData.label = shortActionLabel(nextData.actionType, nextData.config)
          }
          if (patch.actionType) {
            nextData.label = shortActionLabel(nextData.actionType, nextData.config)
          }
          return { ...n, data: nextData }
        }),
      )
    },
    [selectedId, setNodes],
  )

  const patchConfig = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedNode) return
      const cfg = { ...selectedNode.data.config, ...patch }
      updateSelectedData({ config: cfg })
    },
    [selectedNode, updateSelectedData],
  )

  const setActionType = useCallback(
    (actionType: string) => {
      if (!selectedId) return
      const cfg = { ...defaultStepConfig(actionType), stepKey: selectedNode?.data.stepKey }
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== selectedId || n.type !== 'workflowStep') return n
          const d = n.data as WorkflowNodeData
          return {
            ...n,
            data: {
              ...d,
              actionType,
              config: cfg,
              label: shortActionLabel(actionType, cfg),
            },
          }
        }),
      )
      setEdges((eds) =>
        eds.filter((e) => {
          if (e.source !== selectedId) return true
          if (actionType === 'BRANCH_IF') return e.sourceHandle === 'then' || e.sourceHandle === 'else'
          return e.sourceHandle === 'next' || e.sourceHandle === null
        }),
      )
    },
    [selectedId, selectedNode?.data.stepKey, setNodes, setEdges],
  )

  const addNode = useCallback(() => {
    const node = newWorkflowNode('ASSIGN_TEAM', { x: 200 + Math.random() * 80, y: 80 + Math.random() * 120 }, defaultStepConfig('ASSIGN_TEAM'))
    setNodes((nds) => [...nds, node])
  }, [setNodes])

  const deleteSelectedNode = useCallback(() => {
    if (!selectedId || selectedId === WORKFLOW_START_ID) return
    setNodes((nds) => nds.filter((n) => n.id !== selectedId))
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId))
    setSelectedId(null)
  }, [selectedId, setNodes, setEdges])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const name = nombre.trim()
    if (!name) {
      alert('El nombre del flujo es obligatorio.')
      return
    }
    const r = flowToPasos(nodes as Node<WorkflowNodeData>[], edges)
    if (!r.ok) {
      alert(r.error)
      return
    }
    const steps = r.pasos.map((p, i) => ({
      position: i,
      stepType: p.stepType,
      actionType: p.actionType,
      config: prepararConfigParaApi(p.actionType, p.config as Record<string, unknown>),
    }))
    onSave({
      name,
      description: descripcion.trim() || null,
      steps,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(15,23,42,0.5)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1280,
          background: '#F8F7F5',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px rgba(0,0,0,0.2)',
          border: '1px solid var(--border, #e8e6e3)',
        }}
      >
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--border, #e8e6e3)',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' }}>
              {editingId ? 'Editar flujo' : 'Nuevo flujo'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
              Arrastra nodos. Conecta desde Inicio y entre pasos. Clic en un paso para editar en el panel derecho.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saveBusy}
            style={{
              padding: '10px 18px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: '#fff',
              cursor: saveBusy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontWeight: 600,
              color: '#64748b',
            }}
          >
            Cancelar
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onSelectionChange={onSelectionChange}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              deleteKeyCode={['Backspace', 'Delete']}
              selectionKeyCode="Shift"
              panOnScroll
              zoomOnScroll
              proOptions={{ hideAttribution: true }}
              style={{ width: '100%', height: '100%', minHeight: 420, background: '#f1f5f9' }}
            >
              <Background gap={16} color="#cbd5e1" />
              <Controls showInteractive={false} />
              <MiniMap
                nodeStrokeWidth={3}
                zoomable
                pannable
                style={{ borderRadius: 10, overflow: 'hidden' }}
              />
              <Panel position="top-left">
                <button
                  type="button"
                  onClick={addNode}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'var(--accent, #6366f1)',
                    color: '#fff',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    boxShadow: 'var(--card-shadow)',
                  }}
                >
                  <Plus size={16} />
                  Añadir paso
                </button>
              </Panel>
            </ReactFlow>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{
              width: 340,
              flexShrink: 0,
              background: '#fff',
              borderLeft: '1px solid var(--border, #e8e6e3)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 'calc(100vh - 96px)',
            }}
          >
            <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
              <label style={labelBase}>Nombre del flujo *</label>
              <input
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                style={inputBase}
                placeholder="Ej. Bienvenida nuevos socios"
              />
              <label style={{ ...labelBase, marginTop: 14 }}>Descripción</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={2}
                style={{ ...inputBase, minHeight: 56, resize: 'vertical' }}
              />

              <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0', paddingTop: 16 }}>
                {!selectedNode && (
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Selecciona un paso en el lienzo para configurarlo.</p>
                )}
                {selectedNode && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Paso seleccionado</span>
                      <button
                        type="button"
                        onClick={deleteSelectedNode}
                        style={{
                          border: 'none',
                          background: '#fef2f2',
                          color: '#b91c1c',
                          padding: '6px 10px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        <Trash2 size={14} /> Quitar
                      </button>
                    </div>
                    <label style={labelBase}>Tipo de acción</label>
                    <select
                      value={selectedNode.data.actionType}
                      onChange={(e) => setActionType(e.target.value)}
                      style={{ ...inputBase, cursor: 'pointer' }}
                    >
                      {ACCIONES.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <label style={{ ...labelBase, marginTop: 12 }}>Clave del paso (ramas)</label>
                    <input
                      value={String(selectedNode.data.config.stepKey ?? '')}
                      onChange={(e) => patchConfig({ stepKey: e.target.value })}
                      style={inputBase}
                      placeholder="ej. juvenil"
                    />

                    {selectedNode.data.actionType === 'ASSIGN_TEAM' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>Equipo</label>
                        <select
                          value={String(selectedNode.data.config.teamId ?? '')}
                          onChange={(e) => patchConfig({ teamId: e.target.value })}
                          style={{ ...inputBase, cursor: 'pointer' }}
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

                    {selectedNode.data.actionType === 'ASSIGN_TEAM_BY_AGE' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>Equipo</label>
                        <select
                          value={String(selectedNode.data.config.teamId ?? '')}
                          onChange={(e) => patchConfig({ teamId: e.target.value })}
                          style={{ ...inputBase, cursor: 'pointer' }}
                        >
                          <option value="">— Seleccionar —</option>
                          {equipos.map((eq) => (
                            <option key={eq.id} value={eq.id}>
                              {eq.nombre}
                            </option>
                          ))}
                        </select>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                          <div>
                            <label style={labelBase}>Edad mín.</label>
                            <input
                              type="number"
                              value={String(selectedNode.data.config.minAge ?? '')}
                              onChange={(e) => patchConfig({ minAge: e.target.value })}
                              style={inputBase}
                            />
                          </div>
                          <div>
                            <label style={labelBase}>Edad máx.</label>
                            <input
                              type="number"
                              value={String(selectedNode.data.config.maxAge ?? '')}
                              onChange={(e) => patchConfig({ maxAge: e.target.value })}
                              style={inputBase}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {selectedNode.data.actionType === 'SET_MEMBER_STATUS' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>Estado</label>
                        <select
                          value={String(selectedNode.data.config.targetStatus ?? 'ACTIVE')}
                          onChange={(e) => patchConfig({ targetStatus: e.target.value })}
                          style={{ ...inputBase, cursor: 'pointer' }}
                        >
                          <option value="ACTIVE">Activo</option>
                          <option value="INACTIVE">Inactivo</option>
                        </select>
                      </>
                    )}

                    {selectedNode.data.actionType === 'CREATE_PAYMENT' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                        <div>
                          <label style={labelBase}>Importe €</label>
                          <input
                            type="number"
                            step="0.01"
                            value={String(selectedNode.data.config.amount ?? '')}
                            onChange={(e) => patchConfig({ amount: e.target.value })}
                            style={inputBase}
                          />
                        </div>
                        <div>
                          <label style={labelBase}>Mes offset</label>
                          <input
                            type="number"
                            value={String(selectedNode.data.config.monthOffset ?? '0')}
                            onChange={(e) => patchConfig({ monthOffset: e.target.value })}
                            style={inputBase}
                          />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={labelBase}>Estado</label>
                          <select
                            value={String(selectedNode.data.config.paymentStatus ?? 'PENDING')}
                            onChange={(e) => patchConfig({ paymentStatus: e.target.value })}
                            style={{ ...inputBase, cursor: 'pointer' }}
                          >
                            <option value="PENDING">Pendiente</option>
                            <option value="PAID">Pagado</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {selectedNode.data.actionType === 'HTTP_REQUEST' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>URL</label>
                        <input
                          value={String(selectedNode.data.config.httpUrl ?? '')}
                          onChange={(e) => patchConfig({ httpUrl: e.target.value })}
                          style={inputBase}
                        />
                        <label style={{ ...labelBase, marginTop: 10 }}>Método</label>
                        <select
                          value={String(selectedNode.data.config.httpMethod ?? 'POST')}
                          onChange={(e) => patchConfig({ httpMethod: e.target.value })}
                          style={{ ...inputBase, cursor: 'pointer' }}
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                          <option value="PATCH">PATCH</option>
                        </select>
                        <label style={{ ...labelBase, marginTop: 10 }}>Cuerpo</label>
                        <textarea
                          value={String(selectedNode.data.config.httpBody ?? '')}
                          onChange={(e) => patchConfig({ httpBody: e.target.value })}
                          rows={3}
                          style={{ ...inputBase, minHeight: 72 }}
                        />
                      </>
                    )}

                    {selectedNode.data.actionType === 'BRANCH_IF' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>Campo</label>
                        <select
                          value={String(selectedNode.data.config.ifField ?? 'member.age')}
                          onChange={(e) => patchConfig({ ifField: e.target.value })}
                          style={{ ...inputBase, cursor: 'pointer' }}
                        >
                          <option value="member.age">Edad</option>
                          <option value="member.status">Estado</option>
                          <option value="member.hasBirthDate">Tiene fecha nac.</option>
                          <option value="member.name">Nombre</option>
                          <option value="member.email">Correo</option>
                        </select>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 12 }}>
                          <select
                            value={String(selectedNode.data.config.ifOperator ?? 'gte')}
                            onChange={(e) => patchConfig({ ifOperator: e.target.value })}
                            style={{ ...inputBase, cursor: 'pointer' }}
                          >
                            <option value="eq">=</option>
                            <option value="ne">≠</option>
                            <option value="lt">&lt;</option>
                            <option value="lte">≤</option>
                            <option value="gt">&gt;</option>
                            <option value="gte">≥</option>
                            <option value="contains">contiene</option>
                          </select>
                          <input
                            value={String(selectedNode.data.config.ifValue ?? '')}
                            onChange={(e) => patchConfig({ ifValue: e.target.value })}
                            style={inputBase}
                            placeholder="Valor"
                          />
                        </div>
                        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.4 }}>
                          Conecta las salidas «Sí» / «No» a otros pasos. Las claves deben coincidir con la «Clave del paso» del destino.
                        </p>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            <div
              style={{
                padding: 16,
                borderTop: '1px solid var(--border)',
                background: '#fafafa',
              }}
            >
              <button
                type="submit"
                disabled={saveBusy}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--accent, #6366f1)',
                  color: '#fff',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: saveBusy ? 'wait' : 'pointer',
                  opacity: saveBusy ? 0.75 : 1,
                }}
              >
                {saveBusy ? 'Guardando…' : 'Guardar flujo'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

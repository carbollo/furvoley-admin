'use client'

import { useMemo, useRef, useState, type MouseEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createWorkflow } from '@/app/actions/workflows'

type NodeKind = 'TRIGGER' | 'STEP'

type NodeDraft = {
  id: string
  kind: NodeKind
  label: string
  stepType: string
  actionType: string
  config: string
  minAge: string
  maxAge: string
  teamId: string
  x: number
  y: number
}

const triggerOptions = [
  { value: 'MEMBER_CREATED', label: 'Nuevo socio registrado' },
  { value: 'INVOICE_OVERDUE', label: 'Factura vencida' },
  { value: 'PAYMENT_RECEIVED', label: 'Pago recibido' },
  { value: 'SCHEDULED_CRON', label: 'Programado (cron)' },
]

const actionOptions = [
  { value: 'NOTIFY_WHATSAPP', label: 'Enviar WhatsApp' },
  { value: 'SEND_EMAIL', label: 'Enviar email' },
  { value: 'CREATE_INVOICE', label: 'Crear factura' },
  { value: 'TAG_MEMBER', label: 'Etiquetar socio' },
  { value: 'ASSIGN_TEAM_BY_AGE', label: 'Asignar equipo por edad' },
]

function createTriggerNode(): NodeDraft {
  return {
    id: crypto.randomUUID(),
    kind: 'TRIGGER',
    label: 'Trigger',
    stepType: 'TRIGGER',
    actionType: 'MEMBER_CREATED',
    config: '',
    minAge: '',
    maxAge: '',
    teamId: '',
    x: 80,
    y: 90,
  }
}

type TeamOption = {
  id: string
  name: string
  category: string | null
}

export function WorkflowBuilderForm({ teams }: { teams: TeamOption[] }) {
  const [nodes, setNodes] = useState<NodeDraft[]>([createTriggerNode()])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(nodes[0]?.id ?? null)

  const dragRef = useRef<{
    nodeId: string
    offsetX: number
    offsetY: number
  } | null>(null)

  const orderedNodes = useMemo(
    () => [...nodes].sort((a, b) => a.x - b.x || a.y - b.y),
    [nodes],
  )

  const nodesPayload = useMemo(
    () =>
      JSON.stringify(
        orderedNodes.map((node, index) => ({
          kind: node.kind,
          position: index + 1,
          stepType: node.stepType,
          actionType: node.actionType,
          config: {
            value: node.config.trim(),
            minAge: node.minAge.trim(),
            maxAge: node.maxAge.trim(),
            teamId: node.teamId.trim(),
            x: String(Math.round(node.x)),
            y: String(Math.round(node.y)),
            label: node.label.trim() || `Paso ${index + 1}`,
          },
        })),
      ),
    [orderedNodes],
  )

  async function action(formData: FormData) {
    const name = String(formData.get('name') || '')
    const description = String(formData.get('description') || '')
    const isActive = String(formData.get('isActive') || '') === 'on'

    const rawNodes = String(formData.get('nodesPayload') || '[]')

    const parsedNodes = JSON.parse(rawNodes) as Array<{
      kind: NodeKind
      position: number
      stepType: string
      actionType: string
      config?: Record<string, string> | null
    }>

    const triggerNode = parsedNodes.find((node) => node.kind === 'TRIGGER')
    if (!triggerNode) {
      throw new Error('Debes tener un nodo trigger en el tablero')
    }

    const stepNodes = parsedNodes.filter((node) => node.kind === 'STEP')
    if (!stepNodes.length) {
      throw new Error('Añade al menos un nodo de acción al workflow')
    }

    for (const node of stepNodes) {
      if (node.actionType !== 'ASSIGN_TEAM_BY_AGE') continue
      const config = node.config || {}
      if (!config.teamId) {
        throw new Error('Los nodos de asignación por edad requieren seleccionar un equipo')
      }
      if (!config.maxAge && !config.minAge) {
        throw new Error('Los nodos de asignación por edad requieren una edad mínima o máxima')
      }
    }

    await createWorkflow({
      name,
      description,
      triggerType: triggerNode.actionType,
      triggerConfig: triggerNode.config && Object.keys(triggerNode.config).length ? triggerNode.config : null,
      isActive,
      steps: stepNodes.map((node, index) => ({
        position: index + 1,
        stepType: node.stepType,
        actionType: node.actionType,
        config: node.config || null,
      })),
    })

    const triggerNodeAfterSave = createTriggerNode()
    setNodes([triggerNodeAfterSave])
    setSelectedNodeId(triggerNodeAfterSave.id)
  }

  function addNode() {
    const last = orderedNodes[orderedNodes.length - 1]
    const nextX = last ? Math.min(last.x + 220, 980) : 120
    const nextY = last ? last.y : 120

    const newNode: NodeDraft = {
      id: crypto.randomUUID(),
      kind: 'STEP',
      label: `Paso ${nodes.length + 1}`,
      stepType: 'ACTION',
      actionType: 'SEND_EMAIL',
      config: '',
      minAge: '',
      maxAge: '',
      teamId: '',
      x: nextX,
      y: nextY,
    }

    setNodes((current) => [
      ...current,
      newNode,
    ])
    setSelectedNodeId(newNode.id)
  }

  function removeNode(id: string) {
    setNodes((current) => {
      if (current.length <= 1) return current
      const nodeToRemove = current.find((node) => node.id === id)
      if (nodeToRemove?.kind === 'TRIGGER') return current
      const next = current.filter((node) => node.id !== id)
      if (selectedNodeId === id) {
        setSelectedNodeId(next[0]?.id ?? null)
      }
      return next
    })
  }

  function updateNode(id: string, patch: Partial<NodeDraft>) {
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, ...patch } : node)))
  }

  function onNodeMouseDown(event: MouseEvent<HTMLDivElement>, nodeId: string) {
    event.preventDefault()
    const card = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      nodeId,
      offsetX: event.clientX - card.left,
      offsetY: event.clientY - card.top,
    }
    setSelectedNodeId(nodeId)
  }

  function onCanvasMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!dragRef.current) return

    const canvas = event.currentTarget.getBoundingClientRect()
    const nodeWidth = 176
    const nodeHeight = 104

    const rawX = event.clientX - canvas.left - dragRef.current.offsetX
    const rawY = event.clientY - canvas.top - dragRef.current.offsetY

    const constrainedX = Math.max(12, Math.min(rawX, canvas.width - nodeWidth - 12))
    const constrainedY = Math.max(12, Math.min(rawY, canvas.height - nodeHeight - 12))

    updateNode(dragRef.current.nodeId, { x: constrainedX, y: constrainedY })
  }

  function onCanvasMouseUp() {
    dragRef.current = null
  }

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null

  return (
    <form action={action} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Nuevo workflow</h2>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="isActive" defaultChecked />
          Activo
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <input
          name="name"
          required
          placeholder="Nombre del workflow"
          className="border rounded-lg px-3 py-2 text-slate-900"
        />
      </div>

      <input
        name="description"
        placeholder="Descripción (opcional)"
        className="border rounded-lg px-3 py-2 text-slate-900 w-full"
      />

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-slate-700">Tablero visual de nodos (estilo n8n)</p>
          <button
            type="button"
            onClick={addNode}
            className="inline-flex items-center gap-2 text-sm bg-slate-900 text-white px-3 py-1.5 rounded-lg"
          >
            <Plus size={16} />
            Añadir nodo
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
          <div
            className="relative h-[420px] overflow-hidden rounded-xl border border-slate-300 bg-slate-900/95"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(148,163,184,.32) 1px, transparent 0)',
              backgroundSize: '20px 20px',
            }}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp}
            onMouseLeave={onCanvasMouseUp}
          >
            <svg className="absolute inset-0 h-full w-full pointer-events-none">
              {orderedNodes.slice(0, -1).map((node, index) => {
                const next = orderedNodes[index + 1]
                return (
                  <line
                    key={`${node.id}-${next.id}`}
                    x1={node.x + 176}
                    y1={node.y + 52}
                    x2={next.x}
                    y2={next.y + 52}
                    stroke="#38bdf8"
                    strokeWidth={2}
                    strokeDasharray="6 6"
                  />
                )
              })}
            </svg>

            {nodes.map((node, index) => {
              const isSelected = selectedNodeId === node.id
              return (
                <div
                  key={node.id}
                  className={`absolute w-44 rounded-xl border cursor-move select-none ${
                    isSelected
                      ? 'border-blue-400 bg-blue-50 shadow-[0_0_0_2px_rgba(59,130,246,.35)]'
                      : 'border-slate-300 bg-white'
                  }`}
                  style={{ left: node.x, top: node.y }}
                  onMouseDown={(event) => onNodeMouseDown(event, node.id)}
                  onClick={() => setSelectedNodeId(node.id)}
                >
                  <div className="px-3 py-2 border-b border-slate-200 text-xs font-semibold text-slate-500 flex items-center justify-between">
                    <span>Nodo {index + 1}</span>
                    <span>{node.kind === 'TRIGGER' ? 'TRIGGER' : node.stepType}</span>
                  </div>
                  <div className="px-3 py-2">
                    <p className="font-medium text-sm truncate">{node.label || 'Sin título'}</p>
                    <p className="text-xs text-slate-500 truncate">{node.actionType}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Nodo seleccionado</p>
            {!selectedNode && <p className="text-sm text-slate-500">Selecciona un nodo del tablero.</p>}
            {selectedNode && (
              <>
                <input
                  value={selectedNode.label}
                  onChange={(event) => updateNode(selectedNode.id, { label: event.target.value })}
                  placeholder="Nombre del nodo"
                  className="border rounded-lg px-3 py-2 text-slate-900 w-full"
                />
                {selectedNode.kind === 'STEP' && (
                  <>
                    <select
                      value={selectedNode.stepType}
                      onChange={(event) => updateNode(selectedNode.id, { stepType: event.target.value })}
                      className="border rounded-lg px-3 py-2 text-slate-900 bg-white w-full"
                    >
                      <option value="ACTION">Acción</option>
                      <option value="CONDITION">Condición</option>
                      <option value="DELAY">Espera</option>
                    </select>
                    <select
                      value={selectedNode.actionType}
                      onChange={(event) => updateNode(selectedNode.id, { actionType: event.target.value })}
                      className="border rounded-lg px-3 py-2 text-slate-900 bg-white w-full"
                    >
                      {actionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {selectedNode.kind === 'TRIGGER' && (
                  <select
                    value={selectedNode.actionType}
                    onChange={(event) => updateNode(selectedNode.id, { actionType: event.target.value })}
                    className="border rounded-lg px-3 py-2 text-slate-900 bg-white w-full"
                  >
                    {triggerOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        Trigger: {option.label}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  value={selectedNode.config}
                  onChange={(event) => updateNode(selectedNode.id, { config: event.target.value })}
                  placeholder={
                    selectedNode.kind === 'TRIGGER'
                      ? 'Config trigger (ej: 0 9 * * 1)'
                      : selectedNode.actionType === 'ASSIGN_TEAM_BY_AGE'
                        ? 'Config opcional de regla'
                        : 'Config del nodo'
                  }
                  className="border rounded-lg px-3 py-2 text-slate-900 w-full"
                />
                {selectedNode.kind === 'STEP' && selectedNode.actionType === 'ASSIGN_TEAM_BY_AGE' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={0}
                        value={selectedNode.minAge}
                        onChange={(event) => updateNode(selectedNode.id, { minAge: event.target.value })}
                        placeholder="Edad mínima"
                        className="border rounded-lg px-3 py-2 text-slate-900 w-full"
                      />
                      <input
                        type="number"
                        min={0}
                        value={selectedNode.maxAge}
                        onChange={(event) => updateNode(selectedNode.id, { maxAge: event.target.value })}
                        placeholder="Edad máxima"
                        className="border rounded-lg px-3 py-2 text-slate-900 w-full"
                      />
                    </div>
                    <select
                      value={selectedNode.teamId}
                      onChange={(event) => updateNode(selectedNode.id, { teamId: event.target.value })}
                      className="border rounded-lg px-3 py-2 text-slate-900 bg-white w-full"
                    >
                      <option value="">Selecciona equipo destino</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                          {team.category ? ` (${team.category})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500">
                      Regla: si la edad del socio está en el rango, se añade automáticamente al equipo elegido.
                    </p>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => removeNode(selectedNode.id)}
                  className="inline-flex items-center gap-2 text-rose-600 hover:text-rose-700 text-sm"
                  disabled={nodes.length <= 1 || selectedNode.kind === 'TRIGGER'}
                >
                  <Trash2 size={16} />
                  {selectedNode.kind === 'TRIGGER' ? 'El trigger no se puede eliminar' : 'Eliminar nodo'}
                </button>
                <p className="text-xs text-slate-500">
                  Arrastra los nodos en el tablero. El trigger también es un nodo y define el disparador del workflow.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <input type="hidden" name="nodesPayload" value={nodesPayload} readOnly />

      <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
        Guardar workflow
      </button>
    </form>
  )
}

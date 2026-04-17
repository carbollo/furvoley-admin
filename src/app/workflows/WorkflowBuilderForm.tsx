'use client'

import { useMemo, useRef, useState, type MouseEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createWorkflow } from '@/app/actions/workflows'

type NodeDraft = {
  id: string
  label: string
  stepType: string
  actionType: string
  config: string
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
]

export function WorkflowBuilderForm() {
  const [nodes, setNodes] = useState<NodeDraft[]>([
    {
      id: crypto.randomUUID(),
      label: 'Inicio',
      stepType: 'ACTION',
      actionType: 'NOTIFY_WHATSAPP',
      config: '',
      x: 80,
      y: 90,
    },
  ])
  const [triggerType, setTriggerType] = useState('MEMBER_CREATED')
  const [triggerConfig, setTriggerConfig] = useState('')
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

  const stepsPayload = useMemo(
    () =>
      JSON.stringify(
        orderedNodes.map((node, index) => ({
          position: index + 1,
          stepType: node.stepType,
          actionType: node.actionType,
          config: {
            value: node.config.trim(),
            x: String(Math.round(node.x)),
            y: String(Math.round(node.y)),
            label: node.label.trim() || `Paso ${index + 1}`,
          },
        })),
      ),
    [orderedNodes],
  )

  const triggerPayload = useMemo(
    () => JSON.stringify(triggerConfig.trim() ? { value: triggerConfig.trim() } : {}),
    [triggerConfig],
  )

  async function action(formData: FormData) {
    const name = String(formData.get('name') || '')
    const description = String(formData.get('description') || '')
    const triggerTypeValue = String(formData.get('triggerType') || 'MEMBER_CREATED')
    const isActive = String(formData.get('isActive') || '') === 'on'

    const rawSteps = String(formData.get('stepsPayload') || '[]')
    const rawTriggerConfig = String(formData.get('triggerPayload') || '{}')

    const parsedSteps = JSON.parse(rawSteps) as Array<{
      position: number
      stepType: string
      actionType: string
      config?: Record<string, string> | null
    }>
    const parsedTriggerConfig = JSON.parse(rawTriggerConfig) as Record<string, string>

    await createWorkflow({
      name,
      description,
      triggerType: triggerTypeValue,
      triggerConfig: Object.keys(parsedTriggerConfig).length ? parsedTriggerConfig : null,
      isActive,
      steps: parsedSteps,
    })

    const firstId = crypto.randomUUID()
    setNodes([
      {
        id: firstId,
        label: 'Inicio',
        stepType: 'ACTION',
        actionType: 'NOTIFY_WHATSAPP',
        config: '',
        x: 80,
        y: 90,
      },
    ])
    setSelectedNodeId(firstId)
    setTriggerType('MEMBER_CREATED')
    setTriggerConfig('')
  }

  function addNode() {
    const last = orderedNodes[orderedNodes.length - 1]
    const nextX = last ? Math.min(last.x + 220, 980) : 120
    const nextY = last ? last.y : 120

    const newNode: NodeDraft = {
      id: crypto.randomUUID(),
      label: `Paso ${nodes.length + 1}`,
      stepType: 'ACTION',
      actionType: 'SEND_EMAIL',
      config: '',
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          name="name"
          required
          placeholder="Nombre del workflow"
          className="border rounded-lg px-3 py-2 text-slate-900"
        />
        <select
          name="triggerType"
          value={triggerType}
          onChange={(event) => setTriggerType(event.target.value)}
          className="border rounded-lg px-3 py-2 text-slate-900 bg-white"
        >
          {triggerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              Trigger: {option.label}
            </option>
          ))}
        </select>
      </div>

      <input
        name="description"
        placeholder="Descripción (opcional)"
        className="border rounded-lg px-3 py-2 text-slate-900 w-full"
      />

      <input
        value={triggerConfig}
        onChange={(event) => setTriggerConfig(event.target.value)}
        placeholder="Config trigger (ej: 0 9 * * 1 para cron semanal)"
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
                    <span>{node.stepType}</span>
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
                <input
                  value={selectedNode.config}
                  onChange={(event) => updateNode(selectedNode.id, { config: event.target.value })}
                  placeholder="Config del nodo"
                  className="border rounded-lg px-3 py-2 text-slate-900 w-full"
                />
                <button
                  type="button"
                  onClick={() => removeNode(selectedNode.id)}
                  className="inline-flex items-center gap-2 text-rose-600 hover:text-rose-700 text-sm"
                  disabled={nodes.length <= 1}
                >
                  <Trash2 size={16} />
                  Eliminar nodo
                </button>
                <p className="text-xs text-slate-500">
                  Arrastra los nodos en el tablero. Las conexiones se muestran de izquierda a derecha.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <input type="hidden" name="stepsPayload" value={stepsPayload} readOnly />
      <input type="hidden" name="triggerPayload" value={triggerPayload} readOnly />

      <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium">
        Guardar workflow
      </button>
    </form>
  )
}

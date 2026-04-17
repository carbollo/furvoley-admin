'use client'

import { useMemo, useRef, useState, type MouseEvent } from 'react'
import { Plus, Trash2, Zap, Settings, UserPlus, CreditCard, Mail, MessageSquare } from 'lucide-react'
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
  targetStatus: string
  paymentAmount: string
  monthOffset: string
  paymentStatus: string
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
  { value: 'ASSIGN_TEAM', label: 'Asignar equipo directo' },
  { value: 'ASSIGN_TEAM_BY_AGE', label: 'Asignar equipo por edad' },
  { value: 'SET_MEMBER_STATUS', label: 'Cambiar estado del socio' },
  { value: 'CREATE_PAYMENT', label: 'Crear cobro automático' },
  { value: 'SEND_EMAIL', label: 'Enviar email' },
  { value: 'NOTIFY_WHATSAPP', label: 'Enviar WhatsApp' },
]

function getNodeIcon(kind: NodeKind, actionType: string) {
  if (kind === 'TRIGGER') return <Zap size={20} />
  if (actionType.includes('TEAM')) return <UserPlus size={20} />
  if (actionType.includes('PAYMENT')) return <CreditCard size={20} />
  if (actionType === 'SEND_EMAIL') return <Mail size={20} />
  if (actionType === 'NOTIFY_WHATSAPP') return <MessageSquare size={20} />
  return <Settings size={20} />
}

function getNodeColor(kind: NodeKind, actionType: string) {
  if (kind === 'TRIGGER') return 'bg-emerald-500'
  if (actionType.includes('TEAM')) return 'bg-indigo-500'
  if (actionType.includes('PAYMENT')) return 'bg-amber-500'
  if (actionType === 'SEND_EMAIL') return 'bg-rose-500'
  if (actionType === 'NOTIFY_WHATSAPP') return 'bg-green-500'
  return 'bg-blue-500'
}

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
    targetStatus: 'ACTIVE',
    paymentAmount: '',
    monthOffset: '0',
    paymentStatus: 'PENDING',
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
            targetStatus: node.targetStatus.trim(),
            amount: node.paymentAmount.trim(),
            monthOffset: node.monthOffset.trim(),
            paymentStatus: node.paymentStatus.trim(),
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
      const config = node.config || {}
      if (node.actionType === 'ASSIGN_TEAM_BY_AGE') {
        if (!config.teamId) {
          throw new Error('Los nodos de asignación por edad requieren seleccionar un equipo')
        }
        if (!config.maxAge && !config.minAge) {
          throw new Error('Los nodos de asignación por edad requieren una edad mínima o máxima')
        }
      }
      if (node.actionType === 'ASSIGN_TEAM') {
        if (!config.teamId) {
          throw new Error('Los nodos de asignación directa requieren seleccionar un equipo')
        }
      }
      if (node.actionType === 'SET_MEMBER_STATUS') {
        if (!config.targetStatus) {
          throw new Error('Los nodos de cambio de estado requieren estado destino')
        }
      }
      if (node.actionType === 'CREATE_PAYMENT') {
        const amount = Number(config.amount || 0)
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Los nodos de cobro automático requieren un importe válido')
        }
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
    const nextX = last ? Math.min(last.x + 280, 800) : 120
    const nextY = last ? last.y : 120

    const newNode: NodeDraft = {
      id: crypto.randomUUID(),
      kind: 'STEP',
      label: `Paso ${nodes.length + 1}`,
      stepType: 'ACTION',
      actionType: 'ASSIGN_TEAM',
      config: '',
      minAge: '',
      maxAge: '',
      teamId: '',
      targetStatus: 'ACTIVE',
      paymentAmount: '',
      monthOffset: '0',
      paymentStatus: 'PENDING',
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
    const nodeWidth = 224 // w-56 = 14rem = 224px
    const nodeHeight = 64 // h-16 = 4rem = 64px

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
            className="relative h-[600px] overflow-hidden rounded-xl border border-slate-200 bg-[#fafafa]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, #e5e7eb 1px, transparent 0)',
              backgroundSize: '20px 20px',
            }}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp}
            onMouseLeave={onCanvasMouseUp}
          >
            <svg className="absolute inset-0 h-full w-full pointer-events-none">
              {orderedNodes.slice(0, -1).map((node, index) => {
                const next = orderedNodes[index + 1]
                const startX = node.x + 224
                const startY = node.y + 32
                const endX = next.x
                const endY = next.y + 32
                const cp1x = startX + 50
                const cp1y = startY
                const cp2x = endX - 50
                const cp2y = endY
                return (
                  <path
                    key={`${node.id}-${next.id}`}
                    d={`M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`}
                    stroke="#cbd5e1"
                    strokeWidth={2}
                    fill="none"
                  />
                )
              })}
            </svg>

            {nodes.map((node, index) => {
              const isSelected = selectedNodeId === node.id
              return (
                <div
                  key={node.id}
                  className={`absolute w-56 h-16 rounded-xl border cursor-move select-none flex items-center shadow-sm bg-white transition-shadow ${
                    isSelected
                      ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,.2)]'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  style={{ left: node.x, top: node.y }}
                  onMouseDown={(event) => onNodeMouseDown(event, node.id)}
                  onClick={() => setSelectedNodeId(node.id)}
                >
                  {node.kind !== 'TRIGGER' && (
                    <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-300 rounded-full border-2 border-white" />
                  )}
                  <div className={`w-12 h-full flex items-center justify-center rounded-l-xl text-white ${getNodeColor(node.kind, node.actionType)}`}>
                    {getNodeIcon(node.kind, node.actionType)}
                  </div>
                  <div className="px-3 py-2 flex-1 overflow-hidden">
                    <p className="font-bold text-xs text-slate-700 truncate">{node.label || 'Sin título'}</p>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{node.actionType}</p>
                  </div>
                  {index < nodes.length - 1 && (
                    <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-300 rounded-full border-2 border-white" />
                  )}
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
                {(selectedNode.kind === 'TRIGGER' || selectedNode.actionType !== 'ASSIGN_TEAM') && (
                  <input
                    value={selectedNode.config}
                    onChange={(event) => updateNode(selectedNode.id, { config: event.target.value })}
                    placeholder={
                      selectedNode.kind === 'TRIGGER'
                        ? 'Config trigger (ej: 0 9 * * 1)'
                        : selectedNode.actionType === 'ASSIGN_TEAM_BY_AGE'
                          ? 'Config opcional de regla'
                          : selectedNode.actionType === 'SET_MEMBER_STATUS'
                            ? 'Motivo opcional del cambio'
                            : selectedNode.actionType === 'CREATE_PAYMENT'
                              ? 'Descripción opcional del cobro'
                              : 'Config del nodo'
                    }
                    className="border rounded-lg px-3 py-2 text-slate-900 w-full"
                  />
                )}
                {selectedNode.kind === 'STEP' && selectedNode.actionType === 'ASSIGN_TEAM' && (
                  <>
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
                      Añade el socio al equipo elegido al dispararse el workflow.
                    </p>
                  </>
                )}
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
                {selectedNode.kind === 'STEP' && selectedNode.actionType === 'SET_MEMBER_STATUS' && (
                  <>
                    <select
                      value={selectedNode.targetStatus}
                      onChange={(event) => updateNode(selectedNode.id, { targetStatus: event.target.value })}
                      className="border rounded-lg px-3 py-2 text-slate-900 bg-white w-full"
                    >
                      <option value="ACTIVE">Activo</option>
                      <option value="INACTIVE">Inactivo</option>
                    </select>
                    <p className="text-xs text-slate-500">
                      Cambia automáticamente el estado administrativo del socio.
                    </p>
                  </>
                )}
                {selectedNode.kind === 'STEP' && selectedNode.actionType === 'CREATE_PAYMENT' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={selectedNode.paymentAmount}
                        onChange={(event) => updateNode(selectedNode.id, { paymentAmount: event.target.value })}
                        placeholder="Importe (€)"
                        className="border rounded-lg px-3 py-2 text-slate-900 w-full"
                      />
                      <input
                        type="number"
                        step="1"
                        value={selectedNode.monthOffset}
                        onChange={(event) => updateNode(selectedNode.id, { monthOffset: event.target.value })}
                        placeholder="Offset meses"
                        className="border rounded-lg px-3 py-2 text-slate-900 w-full"
                      />
                    </div>
                    <select
                      value={selectedNode.paymentStatus}
                      onChange={(event) => updateNode(selectedNode.id, { paymentStatus: event.target.value })}
                      className="border rounded-lg px-3 py-2 text-slate-900 bg-white w-full"
                    >
                      <option value="PENDING">Pendiente</option>
                      <option value="PAID">Pagado</option>
                    </select>
                    <p className="text-xs text-slate-500">
                      Crea un cobro al socio. Offset 0 = mes actual, 1 = próximo mes.
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

'use client'

import { useCallback, useEffect, useMemo, useState, memo, type CSSProperties, type MouseEvent } from 'react'
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
import { Plus, Trash2, Zap } from 'lucide-react'
import { WORKFLOW_ACTION_OPTIONS } from '@/lib/crm-workflow-actions'
import {
  isWorkflowTriggerAllowed,
  workflowTriggerLabel,
  WORKFLOW_TRIGGER_OPTIONS,
} from '@/lib/crm-workflow-triggers'
import {
  WORKFLOW_START_ID,
  WORKFLOW_EDGE_DEFAULTS,
  WORKFLOW_EDGE_TYPE,
  emptyFlow,
  flowToPasos,
  newWorkflowNode,
  outputDefsByAction,
  shortActionLabel,
  stepsToFlowNodes,
  type WorkflowNodeData,
} from './workflow-graph'
import { WorkflowDeletableEdge } from './WorkflowDeletableEdge'

const ACCIONES = WORKFLOW_ACTION_OPTIONS

function defaultStepConfig(actionType: string): Record<string, unknown> {
  switch (actionType) {
    case 'ASSIGN_TEAM':
      return { teamId: '' }
    case 'ASSIGN_TEAM_BY_AGE':
      return { teamId: '', minAge: '', maxAge: '' }
    case 'ASSIGN_TEAM_BY_PREFERENCE':
      return { teamByPreference: '{}' }
    case 'REMOVE_FROM_TEAM':
      return { teamId: '' }
    case 'SET_MEMBER_STATUS':
      return { targetStatus: 'ACTIVE' }
    case 'SET_MEMBER_SPORT_PREFERENCE':
      return { sportPreference: '' }
    case 'SET_MEMBER_CONTACT':
      return { email: '', phone: '', address: '' }
    case 'SET_MEMBER_DNI':
      return { dni: '' }
    case 'SET_MEMBER_BIRTHDATE':
      return { birthDate: '' }
    case 'CREATE_PAYMENT':
      return { amount: '', monthOffset: '0', paymentStatus: 'PENDING' }
    case 'CREATE_SIGNUP_LINK':
      return { maxUses: '1', expiresInDays: '30' }
    case 'CREATE_TRANSACTION':
      return { type: 'INCOME', amount: '', description: '' }
    case 'SEND_WHATSAPP':
      return { waSessionId: '', waPhone: '', waMessage: '' }
    case 'SEND_WHATSAPP_TO_COACH':
      return {
        teamId: '',
        waSessionId: '',
        waMessage:
          'Hola {coachName}, nuevo jugador en {assignedTeamName}: {memberName}. Revisa la plantilla en el CRM.',
      }
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
    case 'GENERATE_TEAM_SESSIONS':
      return {
        teamId: '',
        regenerate: true,
        untilSeasonEnd: true,
        weeksAhead: '4',
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
  if (actionType === 'CREATE_TRANSACTION') {
    if (o.amount !== '' && o.amount != null) {
      const n = Number(o.amount)
      if (Number.isFinite(n) && n > 0) o.amount = n
      else delete o.amount
    }
  }
  if (actionType === 'SEND_WHATSAPP' || actionType === 'SEND_WHATSAPP_TO_COACH') {
    if (typeof o.waPhone === 'string') o.waPhone = o.waPhone.trim()
    if (typeof o.waMessage === 'string') o.waMessage = o.waMessage.trim()
    if (typeof o.waSessionId === 'string') o.waSessionId = o.waSessionId.trim()
    if (typeof o.teamId === 'string') o.teamId = o.teamId.trim()
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
  if (actionType === 'GENERATE_TEAM_SESSIONS') {
    if (typeof o.teamId === 'string') o.teamId = o.teamId.trim()
    if (o.weeksAhead !== '' && o.weeksAhead != null) {
      const n = Math.trunc(Number(o.weeksAhead))
      if (Number.isFinite(n) && n >= 1 && n <= 12) o.weeksAhead = String(n)
      else delete o.weeksAhead
    }
  }
  if (actionType === 'CREATE_SIGNUP_LINK') {
    if (o.maxUses !== '' && o.maxUses != null) {
      const n = Math.trunc(Number(o.maxUses))
      if (Number.isFinite(n) && n > 0) o.maxUses = String(n)
      else delete o.maxUses
    }
    if (o.expiresInDays !== '' && o.expiresInDays != null) {
      const n = Math.trunc(Number(o.expiresInDays))
      if (Number.isFinite(n) && n > 0) o.expiresInDays = String(n)
      else delete o.expiresInDays
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

const triggerCard = (selected: boolean): CSSProperties => ({
  padding: '12px 16px 12px 14px',
  borderRadius: 12,
  background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
  border: `2px solid ${selected ? '#059669' : '#6ee7b7'}`,
  borderLeftWidth: 4,
  borderLeftColor: selected ? '#047857' : '#10b981',
  color: '#064e3b',
  minWidth: 148,
  maxWidth: 220,
  boxShadow: 'var(--card-shadow, 0 1px 3px rgba(0,0,0,0.08))',
})

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

const WorkflowTriggerNode = memo(function WorkflowTriggerNode({ data, selected }: NodeProps<Node<WorkflowNodeData>>) {
  return (
    <div style={triggerCard(!!selected)}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#059669', marginBottom: 6 }}>
        DISPARADOR
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Zap size={18} strokeWidth={2.5} style={{ color: '#10b981', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{data.label}</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: '#059669', width: 10, height: 10, border: '2px solid #fff' }}
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

const nodeTypes = { workflowTrigger: WorkflowTriggerNode, workflowStep: WorkflowStepNode }

const edgeTypes = { [WORKFLOW_EDGE_TYPE]: WorkflowDeletableEdge }

type BundleEquip = { id: string; nombre: string }

type TokenOption = { token: string; label: string }
type TokenGroup = { sourceLabel: string; options: TokenOption[] }

function tokenSafePart(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^\w]/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function tokenTargetsForAction(actionType: string): Array<{ key: string; label: string }> {
  if (actionType === 'SEND_WHATSAPP' || actionType === 'SEND_WHATSAPP_TO_COACH') {
    return [
      ...(actionType === 'SEND_WHATSAPP'
        ? [{ key: 'waPhone', label: 'WhatsApp · Teléfono' }]
        : [{ key: 'teamId', label: 'Equipo (vacío = asignado)' }]),
      { key: 'waMessage', label: 'WhatsApp · Mensaje' },
    ]
  }
  if (actionType === 'HTTP_REQUEST') {
    return [
      { key: 'httpUrl', label: 'HTTP · URL' },
      { key: 'httpBody', label: 'HTTP · Body' },
      { key: 'httpHeaders', label: 'HTTP · Headers JSON' },
    ]
  }
  if (actionType === 'BRANCH_IF') {
    return [{ key: 'ifValue', label: 'Condición · Valor comparado' }]
  }
  if (actionType === 'SET_MEMBER_CONTACT') {
    return [
      { key: 'email', label: 'Contacto · Email' },
      { key: 'phone', label: 'Contacto · Teléfono' },
      { key: 'address', label: 'Contacto · Dirección' },
    ]
  }
  return []
}

function triggerTokenOptionsByType(triggerType: string): TokenOption[] {
  const memberBase: TokenOption[] = [
    { token: '{memberId}', label: 'Socio ID' },
    { token: '{memberName}', label: 'Socio nombre' },
    { token: '{memberEmail}', label: 'Socio email' },
    { token: '{memberPhone}', label: 'Socio teléfono' },
    { token: '{memberAddress}', label: 'Socio dirección' },
    { token: '{memberDni}', label: 'Socio DNI' },
    { token: '{memberStatus}', label: 'Socio estado' },
    { token: '{memberSportPreference}', label: 'Socio preferencia deportiva' },
    { token: '{memberAge}', label: 'Socio edad' },
  ]
  const triggerBase: TokenOption[] = [
    { token: '{triggerType}', label: 'Trigger · tipo' },
    { token: '{triggerEventAt}', label: 'Trigger · fecha evento' },
    { token: '{triggerMemberId}', label: 'Trigger · socio id' },
    { token: '{triggerMemberName}', label: 'Trigger · socio nombre' },
    { token: '{triggerMemberEmail}', label: 'Trigger · socio email' },
    { token: '{triggerMemberPhone}', label: 'Trigger · socio teléfono' },
    { token: '{triggerMemberStatus}', label: 'Trigger · socio estado' },
  ]
  const memberStatusChanged: TokenOption[] = [
    { token: '{triggerPreviousStatus}', label: 'Trigger · estado anterior' },
    { token: '{triggerCurrentStatus}', label: 'Trigger · estado actual' },
  ]
  const paymentTrigger: TokenOption[] = [
    { token: '{triggerPaymentId}', label: 'Trigger · pago id' },
    { token: '{triggerPaymentAmount}', label: 'Trigger · pago importe' },
    { token: '{triggerPaymentMonth}', label: 'Trigger · pago mes' },
    { token: '{triggerPaymentYear}', label: 'Trigger · pago año' },
    { token: '{triggerPaymentStatus}', label: 'Trigger · pago estado' },
    { token: '{triggerPaymentPaidAt}', label: 'Trigger · pago fecha cobro' },
    { token: '{triggerPaymentCreatedAt}', label: 'Trigger · pago creado' },
    { token: '{triggerPaymentUpdatedAt}', label: 'Trigger · pago actualizado' },
  ]

  if (triggerType === 'MEMBER_STATUS_CHANGED') {
    return [...memberBase, ...triggerBase, ...memberStatusChanged]
  }
  if (triggerType === 'PAYMENT_CREATED' || triggerType === 'PAYMENT_PAID') {
    return [...memberBase, ...triggerBase, ...paymentTrigger]
  }
  return [...memberBase, ...triggerBase]
}

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
  /** Tipo de disparador del flujo (p. ej. MEMBER_CREATED). Define la etiqueta del nodo trigger. */
  triggerType: string
  editingId: string | null
  onClose: () => void
  onSave: (payload: {
    name: string
    description: string | null
    triggerType: string
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
  triggerType,
  editingId,
  onClose,
  onSave,
  saveBusy,
}: {
  equipos: BundleEquip[]
  initialNombre: string
  initialDescripcion: string
  initialPasos: WorkflowEditorInitialPaso[]
  triggerType: string
  editingId: string | null
  onClose: () => void
  onSave: (payload: {
    name: string
    description: string | null
    triggerType: string
    steps: Array<{ position: number; stepType: string; actionType: string; config: Record<string, unknown> }>
  }) => void
  saveBusy: boolean
}) {
  const [nombre, setNombre] = useState(initialNombre)
  const [descripcion, setDescripcion] = useState(initialDescripcion)

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () =>
      initialPasos.length ? stepsToFlowNodes(initialPasos, triggerType) : emptyFlow(triggerType),
    [initialPasos, triggerType],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([])
  const [tokenTargetField, setTokenTargetField] = useState<string | null>(null)
  const [tokenSearch, setTokenSearch] = useState('')
  const [lastInsertedToken, setLastInsertedToken] = useState('')

  useEffect(() => {
    setNombre(initialNombre)
    setDescripcion(initialDescripcion)
    const { nodes: n, edges: e } = initialPasos.length
      ? stepsToFlowNodes(initialPasos, triggerType)
      : emptyFlow(triggerType)
    setNodes(n)
    setEdges(e)
    setSelectedId(null)
    setSelectedEdgeIds([])
    setTokenTargetField(null)
    setTokenSearch('')
    setLastInsertedToken('')
  }, [initialPasos, initialNombre, initialDescripcion, triggerType, setNodes, setEdges])

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId && n.type === 'workflowStep') as Node<WorkflowNodeData> | undefined,
    [nodes, selectedId],
  )

  const priorStepNodes = useMemo(() => {
    if (!selectedNode) return [] as Node<WorkflowNodeData>[]
    const stepMap = new Map(
      nodes
        .filter((n): n is Node<WorkflowNodeData> => n.type === 'workflowStep')
        .map((n) => [n.id, n] as const),
    )
    const ancestors = new Set<string>()
    const queue: string[] = [selectedNode.id]
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const e of edges) {
        if (e.target !== current) continue
        if (e.source === WORKFLOW_START_ID) continue
        if (!stepMap.has(e.source) || ancestors.has(e.source)) continue
        ancestors.add(e.source)
        queue.push(e.source)
      }
    }
    return Array.from(ancestors)
      .map((id) => stepMap.get(id))
      .filter((n): n is Node<WorkflowNodeData> => !!n)
  }, [edges, nodes, selectedNode])

  const triggerConnectedToSelected = useMemo(() => {
    if (!selectedNode) return false
    const queue: string[] = [selectedNode.id]
    const seen = new Set<string>()
    while (queue.length > 0) {
      const current = queue.shift()!
      if (seen.has(current)) continue
      seen.add(current)
      for (const e of edges) {
        if (e.target !== current) continue
        if (e.source === WORKFLOW_START_ID) return true
        queue.push(e.source)
      }
    }
    return false
  }, [edges, selectedNode])

  const selectedTriggerNode = useMemo(
    () =>
      selectedId === WORKFLOW_START_ID
        ? (nodes.find((n) => n.id === WORKFLOW_START_ID && n.type === 'workflowTrigger') as
            | Node<WorkflowNodeData>
            | undefined)
        : undefined,
    [nodes, selectedId],
  )

  const selectedTriggerType = useMemo(() => {
    const triggerNode = nodes.find((n) => n.id === WORKFLOW_START_ID && n.type === 'workflowTrigger')
    const cfg =
      triggerNode?.data && typeof (triggerNode.data as WorkflowNodeData).config === 'object'
        ? ((triggerNode.data as WorkflowNodeData).config as Record<string, unknown>)
        : {}
    return typeof cfg.triggerType === 'string' && cfg.triggerType
      ? cfg.triggerType
      : triggerType
  }, [nodes, triggerType])

  const availableTokenGroups = useMemo(() => {
    const groups: TokenGroup[] = []
    if (triggerConnectedToSelected) {
      groups.push({
        sourceLabel: 'Disparador',
        options: triggerTokenOptionsByType(selectedTriggerType),
      })
    }
    for (const n of priorStepNodes) {
      const d = n.data as WorkflowNodeData
      const stepTitle = d.label || d.actionType || d.stepKey
      const defs = Array.isArray(d.outputs) ? d.outputs : outputDefsByAction(d.actionType)
      const options: TokenOption[] = []
      for (const def of defs) {
        options.push({
          token: `{${def.key}}`,
          label: def.label,
        })
        const scopedKey = `node_${tokenSafePart(d.stepKey)}_${def.key}`
        options.push({
          token: `{${scopedKey}}`,
          label: `${def.label} (fijo por nodo)`,
        })
      }
      groups.push({ sourceLabel: stepTitle, options })
    }
    return groups
  }, [priorStepNodes, triggerConnectedToSelected, selectedTriggerType])

  const tokenTargets = useMemo(
    () => (selectedNode ? tokenTargetsForAction(selectedNode.data.actionType) : []),
    [selectedNode],
  )

  const selectedTargetLabel = useMemo(
    () => tokenTargets.find((t) => t.key === tokenTargetField)?.label ?? null,
    [tokenTargets, tokenTargetField],
  )

  const filteredTokenGroups = useMemo(() => {
    const q = tokenSearch.trim().toLowerCase()
    if (!q) return availableTokenGroups
    return availableTokenGroups
      .map((g) => ({
        ...g,
        options: g.options.filter(
          (o) => o.token.toLowerCase().includes(q) || o.label.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.options.length > 0)
  }, [availableTokenGroups, tokenSearch])

  const setWorkflowTriggerType = useCallback(
    (value: string) => {
      if (!isWorkflowTriggerAllowed(value)) return
      setNodes((nds) =>
        nds.map((n) =>
          n.id === WORKFLOW_START_ID && n.type === 'workflowTrigger'
            ? {
                ...n,
                data: {
                  ...(n.data as WorkflowNodeData),
                  label: workflowTriggerLabel(value),
                  config: {
                    ...(typeof (n.data as WorkflowNodeData).config === 'object' &&
                    (n.data as WorkflowNodeData).config
                      ? (n.data as WorkflowNodeData).config
                      : {}),
                    triggerType: value,
                  },
                },
              }
            : n,
        ),
      )
    },
    [setNodes],
  )

  const removeEdgeById = useCallback(
    (id: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== id))
      setSelectedEdgeIds((ids) => ids.filter((x) => x !== id))
    },
    [setEdges],
  )

  useEffect(() => {
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (selectedEdgeIds.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      setEdges((eds) => eds.filter((ed) => !selectedEdgeIds.includes(ed.id)))
      setSelectedEdgeIds([])
    }

    window.addEventListener('keydown', onWindowKeyDown, true)
    return () => window.removeEventListener('keydown', onWindowKeyDown, true)
  }, [selectedEdgeIds, setEdges])

  const handleEdgeClick = useCallback(
    (e: MouseEvent, edge: Edge) => {
      if (e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        removeEdgeById(edge.id)
      }
    },
    [removeEdgeById],
  )

  const handleEdgeDoubleClick = useCallback(
    (e: MouseEvent, edge: Edge) => {
      e.preventDefault()
      e.stopPropagation()
      removeEdgeById(edge.id)
    },
    [removeEdgeById],
  )

  const defaultEdgeOptions = useMemo(
    () => ({ ...WORKFLOW_EDGE_DEFAULTS }) satisfies Partial<Edge>,
    [],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            ...WORKFLOW_EDGE_DEFAULTS,
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

  const onSelectionChange = useCallback(({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
    const first = selNodes[0]
    setSelectedId(first?.id ?? null)
    setSelectedEdgeIds(selEdges.map((e) => e.id))
  }, [])

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

  const appendTokenToField = useCallback(
    (configKey: string, token: string) => {
      if (!selectedNode) return
      const prev = String((selectedNode.data.config as Record<string, unknown>)[configKey] ?? '')
      patchConfig({ [configKey]: `${prev}${token}` })
    },
    [patchConfig, selectedNode],
  )

  const insertToken = useCallback(
    (token: string) => {
      if (!tokenTargetField) return
      appendTokenToField(tokenTargetField, token)
      setLastInsertedToken(token)
    },
    [appendTokenToField, tokenTargetField],
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
              outputs: outputDefsByAction(actionType),
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
      setTokenTargetField(null)
      setTokenSearch('')
      setLastInsertedToken('')
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
    const triggerN = nodes.find((n) => n.id === WORKFLOW_START_ID && n.type === 'workflowTrigger')
    const cfg = triggerN?.data && typeof (triggerN.data as WorkflowNodeData).config === 'object'
      ? ((triggerN.data as WorkflowNodeData).config as Record<string, unknown>)
      : {}
    const resolvedTrigger =
      typeof cfg.triggerType === 'string' && isWorkflowTriggerAllowed(cfg.triggerType)
        ? cfg.triggerType
        : triggerType
    onSave({
      name,
      description: descripcion.trim() || null,
      triggerType: resolvedTrigger,
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
              Arrastra pasos; el disparador no se mueve. En cada conexión hay un botón × en el centro del cable para
              quitarla. También: Supr/Retroceso con la línea seleccionada, doble clic o Alt+clic. Configuración: clic en
              disparador o paso a la derecha.
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
              onEdgeClick={handleEdgeClick}
              onEdgeDoubleClick={handleEdgeDoubleClick}
              isValidConnection={isValidConnection}
              onSelectionChange={onSelectionChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              elevateEdgesOnSelect
              zoomOnDoubleClick={false}
              edgesReconnectable={false}
              elementsSelectable
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
                {!selectedNode && !selectedTriggerNode && (
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                    Haz clic en el disparador o en un paso del lienzo para configurarlo.
                  </p>
                )}
                {selectedTriggerNode && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>
                      Disparador
                    </div>
                    <label style={labelBase}>Evento que inicia el flujo</label>
                    <select
                      value={String((selectedTriggerNode.data.config as Record<string, unknown>).triggerType ?? triggerType)}
                      onChange={(e) => setWorkflowTriggerType(e.target.value)}
                      style={{ ...inputBase, cursor: 'pointer' }}
                    >
                      {WORKFLOW_TRIGGER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.45, marginBottom: 0 }}>
                      Hoy el motor ejecuta automáticamente solo los flujos con disparador «Alta de socio». Otros quedan
                      guardados para cuando se conecten al sistema.
                    </p>
                  </>
                )}
                {selectedNode && (
                  <>
                    <div style={{ marginTop: 12, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: '#f8fafc' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Salidas de este nodo</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(selectedNode.data.outputs || outputDefsByAction(selectedNode.data.actionType)).map((out) => (
                          <span key={out.key} style={{ fontSize: 11, color: '#334155', background: '#e2e8f0', borderRadius: 999, padding: '3px 8px' }}>
                            {`{${out.key}}`}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: '#f8fafc' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Insertar variable (tipo n8n)</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {tokenTargets.length === 0 ? (
                          <span style={{ fontSize: 11, color: '#64748b' }}>Este tipo de nodo no tiene campos con inserción rápida.</span>
                        ) : (
                          tokenTargets.map((t) => (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setTokenTargetField(t.key)}
                              style={{
                                border: '1px solid',
                                borderColor: tokenTargetField === t.key ? '#6366f1' : '#cbd5e1',
                                background: tokenTargetField === t.key ? '#eef2ff' : '#fff',
                                color: tokenTargetField === t.key ? '#3730a3' : '#334155',
                                borderRadius: 999,
                                padding: '4px 9px',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              {t.label}
                            </button>
                          ))
                        )}
                      </div>
                      <input
                        value={tokenSearch}
                        onChange={(e) => setTokenSearch(e.target.value)}
                        placeholder="Buscar variable..."
                        style={{ ...inputBase, padding: '8px 10px', fontSize: 12, marginBottom: 8 }}
                      />
                      <div style={{ maxHeight: 170, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, background: '#fff' }}>
                        {!tokenTargetField ? (
                          <div style={{ fontSize: 11, color: '#64748b' }}>Selecciona primero el campo destino.</div>
                        ) : filteredTokenGroups.length === 0 ? (
                          <div style={{ fontSize: 11, color: '#64748b' }}>No hay variables de nodos previos.</div>
                        ) : (
                          filteredTokenGroups.map((group) => (
                            <div key={group.sourceLabel} style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>{group.sourceLabel}</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {group.options.map((opt) => (
                                  <button
                                    key={`${group.sourceLabel}-${opt.token}-${opt.label}`}
                                    type="button"
                                    onClick={() => insertToken(opt.token)}
                                    style={{
                                      border: '1px solid #cbd5e1',
                                      background: '#f8fafc',
                                      color: '#0f172a',
                                      borderRadius: 8,
                                      padding: '4px 8px',
                                      fontSize: 11,
                                      cursor: 'pointer',
                                    }}
                                    title={opt.token}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                        Destino: <strong>{selectedTargetLabel || '—'}</strong>
                        {lastInsertedToken ? ` · Último insertado: ${lastInsertedToken}` : ''}
                      </div>
                    </div>
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

                    {selectedNode.data.actionType === 'GENERATE_TEAM_SESSIONS' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>Equipo (opcional)</label>
                        <select
                          value={String(selectedNode.data.config.teamId ?? '')}
                          onChange={(e) => patchConfig({ teamId: e.target.value })}
                          style={{ ...inputBase, cursor: 'pointer' }}
                        >
                          <option value="">— Equipo del disparador —</option>
                          {equipos.map((eq) => (
                            <option key={eq.id} value={eq.id}>
                              {eq.nombre}
                            </option>
                          ))}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={selectedNode.data.config.regenerate !== false}
                            onChange={(e) => patchConfig({ regenerate: e.target.checked })}
                          />
                          Regenerar sesiones futuras auto-generadas
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={selectedNode.data.config.untilSeasonEnd !== false}
                            onChange={(e) => patchConfig({ untilSeasonEnd: e.target.checked })}
                          />
                          Hasta fin de temporada del equipo
                        </label>
                        {selectedNode.data.config.untilSeasonEnd === false && (
                          <div>
                            <label style={{ ...labelBase, marginTop: 12 }}>Semanas (modo legacy)</label>
                            <input
                              type="number"
                              min={1}
                              max={12}
                              value={String(selectedNode.data.config.weeksAhead ?? '4')}
                              onChange={(e) => patchConfig({ weeksAhead: e.target.value })}
                              style={inputBase}
                            />
                          </div>
                        )}
                        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.4 }}>
                          Crea entrenamientos TRAINING según horarios fijos; excluye festivos del club.
                        </p>
                      </>
                    )}

                    {selectedNode.data.actionType === 'REMOVE_FROM_TEAM' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>Equipo (opcional)</label>
                        <select
                          value={String(selectedNode.data.config.teamId ?? '')}
                          onChange={(e) => patchConfig({ teamId: e.target.value })}
                          style={{ ...inputBase, cursor: 'pointer' }}
                        >
                          <option value="">— Todos los equipos —</option>
                          {equipos.map((eq) => (
                            <option key={eq.id} value={eq.id}>
                              {eq.nombre}
                            </option>
                          ))}
                        </select>
                        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.4 }}>
                          Si dejas vacío, quitará al socio de todos los equipos.
                        </p>
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

                    {selectedNode.data.actionType === 'SET_MEMBER_SPORT_PREFERENCE' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>Preferencia deportiva</label>
                        <input
                          value={String(selectedNode.data.config.sportPreference ?? '')}
                          onChange={(e) => patchConfig({ sportPreference: e.target.value })}
                          style={inputBase}
                          placeholder="Ej. Voley playa"
                        />
                      </>
                    )}

                    {selectedNode.data.actionType === 'SET_MEMBER_CONTACT' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>Email</label>
                        <input
                          value={String(selectedNode.data.config.email ?? '')}
                          onChange={(e) => patchConfig({ email: e.target.value })}
                          style={inputBase}
                          placeholder="correo@ejemplo.com"
                        />
                        <label style={{ ...labelBase, marginTop: 10 }}>Teléfono</label>
                        <input
                          value={String(selectedNode.data.config.phone ?? '')}
                          onChange={(e) => patchConfig({ phone: e.target.value })}
                          style={inputBase}
                          placeholder="+34 ..."
                        />
                        <label style={{ ...labelBase, marginTop: 10 }}>Dirección</label>
                        <input
                          value={String(selectedNode.data.config.address ?? '')}
                          onChange={(e) => patchConfig({ address: e.target.value })}
                          style={inputBase}
                          placeholder="Calle / número"
                        />
                      </>
                    )}

                    {selectedNode.data.actionType === 'SET_MEMBER_DNI' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>DNI</label>
                        <input
                          value={String(selectedNode.data.config.dni ?? '')}
                          onChange={(e) => patchConfig({ dni: e.target.value })}
                          style={inputBase}
                          placeholder="12345678A"
                        />
                      </>
                    )}

                    {selectedNode.data.actionType === 'SET_MEMBER_BIRTHDATE' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>Fecha nacimiento</label>
                        <input
                          type="date"
                          value={String(selectedNode.data.config.birthDate ?? '')}
                          onChange={(e) => patchConfig({ birthDate: e.target.value })}
                          style={inputBase}
                        />
                      </>
                    )}

                    {selectedNode.data.actionType === 'ASSIGN_TEAM_BY_PREFERENCE' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>
                          Mapa JSON preferencia→equipo
                        </label>
                        <textarea
                          value={String(selectedNode.data.config.teamByPreference ?? '{}')}
                          onChange={(e) => patchConfig({ teamByPreference: e.target.value })}
                          rows={4}
                          style={{ ...inputBase, minHeight: 96 }}
                          placeholder='{"voley playa":"teamId1","voley pista":"teamId2"}'
                        />
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

                    {selectedNode.data.actionType === 'CREATE_SIGNUP_LINK' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                        <div>
                          <label style={labelBase}>Usos máximos</label>
                          <input
                            type="number"
                            min={1}
                            value={String(selectedNode.data.config.maxUses ?? '1')}
                            onChange={(e) => patchConfig({ maxUses: e.target.value })}
                            style={inputBase}
                          />
                        </div>
                        <div>
                          <label style={labelBase}>Caduca en días</label>
                          <input
                            type="number"
                            min={1}
                            value={String(selectedNode.data.config.expiresInDays ?? '30')}
                            onChange={(e) => patchConfig({ expiresInDays: e.target.value })}
                            style={inputBase}
                          />
                        </div>
                      </div>
                    )}

                    {selectedNode.data.actionType === 'CREATE_TRANSACTION' && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>Tipo de movimiento</label>
                        <select
                          value={String(selectedNode.data.config.type ?? 'INCOME')}
                          onChange={(e) => patchConfig({ type: e.target.value })}
                          style={{ ...inputBase, cursor: 'pointer' }}
                        >
                          <option value="INCOME">Ingreso</option>
                          <option value="EXPENSE">Gasto</option>
                        </select>
                        <label style={{ ...labelBase, marginTop: 10 }}>Importe</label>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={String(selectedNode.data.config.amount ?? '')}
                          onChange={(e) => patchConfig({ amount: e.target.value })}
                          style={inputBase}
                        />
                        <label style={{ ...labelBase, marginTop: 10 }}>Descripción</label>
                        <input
                          value={String(selectedNode.data.config.description ?? '')}
                          onChange={(e) => patchConfig({ description: e.target.value })}
                          style={inputBase}
                          placeholder="Concepto del movimiento"
                        />
                      </>
                    )}

                    {(selectedNode.data.actionType === 'SEND_WHATSAPP' ||
                      selectedNode.data.actionType === 'SEND_WHATSAPP_TO_COACH') && (
                      <>
                        <label style={{ ...labelBase, marginTop: 12 }}>Session ID (opcional)</label>
                        <input
                          value={String(selectedNode.data.config.waSessionId ?? '')}
                          onChange={(e) => patchConfig({ waSessionId: e.target.value })}
                          style={inputBase}
                          placeholder="Si vacío, usa APIWASS_DEFAULT_SESSION_ID"
                        />
                        {selectedNode.data.actionType === 'SEND_WHATSAPP_TO_COACH' && (
                          <>
                            <label style={{ ...labelBase, marginTop: 10 }}>Equipo (opcional)</label>
                            <select
                              value={String(selectedNode.data.config.teamId ?? '')}
                              onChange={(e) => patchConfig({ teamId: e.target.value })}
                              style={{ ...inputBase, cursor: 'pointer' }}
                            >
                              <option value="">Usar equipo asignado en el flujo</option>
                              {equipos.map((eq) => (
                                <option key={eq.id} value={eq.id}>
                                  {eq.nombre}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        {selectedNode.data.actionType === 'SEND_WHATSAPP' && (
                          <>
                            <label style={{ ...labelBase, marginTop: 10 }}>Teléfono destino</label>
                            <input
                              value={String(selectedNode.data.config.waPhone ?? '{guardianPhone}')}
                              onChange={(e) => patchConfig({ waPhone: e.target.value })}
                              style={inputBase}
                              placeholder="{guardianPhone} o 34666777888"
                            />
                          </>
                        )}
                        <label style={{ ...labelBase, marginTop: 10 }}>Mensaje</label>
                        <textarea
                          value={String(selectedNode.data.config.waMessage ?? '')}
                          onChange={(e) => patchConfig({ waMessage: e.target.value })}
                          rows={3}
                          style={{ ...inputBase, minHeight: 72 }}
                          placeholder="Escribe el mensaje..."
                        />
                        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.45 }}>
                          Variables: {'{memberName}'}, {'{assignedTeamName}'}, {'{teamScheduleSummary}'},
                          {'{teamTrainingLocation}'}, {'{coachName}'}, {'{coachPhone}'}, {'{guardianPhone}'}
                        </p>
                      </>
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
                        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.45 }}>
                          Puedes interpolar resultados previos: {'{stepActionType}'}, {'{stepApplied}'}, {'{stepError}'},
                          {'{stepHttpStatus}'}, {'{assignedTeamName}'}, {'{stepCreatedPaymentId}'}
                        </p>
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
                          Conecta las salidas «Sí» / «No» en el lienzo al paso destino; el flujo se resuelve por esas conexiones.
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

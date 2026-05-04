import type { Edge, Node } from '@xyflow/react'

export type WorkflowNodeData = {
  actionType: string
  config: Record<string, unknown>
  stepKey: string
  label: string
}

export type WorkflowPasoPayload = {
  stepType: string
  actionType: string
  config: Record<string, unknown>
}

const START_ID = 'start'

function genStepKey() {
  return `step_${Math.random().toString(36).slice(2, 10)}`
}

function getStepKeyFromPaso(p: {
  actionType: string
  config: unknown
}): string {
  const c = p.config && typeof p.config === 'object' ? (p.config as Record<string, unknown>) : {}
  const k = c.stepKey
  return typeof k === 'string' && k.trim() ? k.trim() : genStepKey()
}

/** Etiqueta humana del tipo de disparador (igual que en la lista de flujos). */
export function workflowTriggerLabel(triggerType: string): string {
  const m: Record<string, string> = { MEMBER_CREATED: 'Alta de socio' }
  return m[triggerType] ?? triggerType
}

export function shortActionLabel(actionType: string, c: Record<string, unknown>) {
  switch (actionType) {
    case 'ASSIGN_TEAM':
      return 'Asignar equipo'
    case 'ASSIGN_TEAM_BY_AGE':
      return 'Equipo por edad'
    case 'SET_MEMBER_STATUS':
      return 'Estado socio'
    case 'CREATE_PAYMENT':
      return 'Cobro'
    case 'HTTP_REQUEST':
      return 'HTTP'
    case 'BRANCH_IF':
      return 'Condición'
    default:
      return actionType
  }
}

/** Flujo vacío: solo nodo disparador (trigger). */
export function emptyFlow(
  triggerType = 'MEMBER_CREATED',
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  const label = workflowTriggerLabel(triggerType)
  return {
    nodes: [
      {
        id: START_ID,
        type: 'workflowTrigger',
        position: { x: 0, y: 160 },
        data: {
          label,
          actionType: '_TRIGGER',
          config: { triggerType },
          stepKey: '_trigger',
        },
        draggable: false,
      },
    ],
    edges: [],
  }
}

/** Convierte pasos guardados en API → nodos/aristas para React Flow */
export function stepsToFlowNodes(
  pasos: Array<{
    position: number
    stepType: string
    actionType: string
    config: unknown
  }>,
  triggerType = 'MEMBER_CREATED',
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  if (!pasos.length) return emptyFlow(triggerType)

  const sorted = [...pasos].sort((a, b) => a.position - b.position)
  const label = workflowTriggerLabel(triggerType)
  const nodes: Node<WorkflowNodeData>[] = [
    {
      id: START_ID,
      type: 'workflowTrigger',
      position: { x: 0, y: 140 },
      data: {
        label,
        actionType: '_TRIGGER',
        config: { triggerType },
        stepKey: '_trigger',
      },
      draggable: false,
    },
  ]

  sorted.forEach((p, idx) => {
    const stepKey = getStepKeyFromPaso(p)
    const cfg =
      p.config && typeof p.config === 'object' && !Array.isArray(p.config)
        ? { ...(p.config as Record<string, unknown>) }
        : {}
    cfg.stepKey = stepKey
    const label = shortActionLabel(p.actionType, cfg)
    nodes.push({
      id: stepKey,
      type: 'workflowStep',
      position: { x: 220 + idx * 260, y: 120 },
      data: {
        actionType: p.actionType,
        config: cfg,
        stepKey,
        label,
      },
    })
  })

  const edges: Edge[] = []
  if (sorted.length > 0) {
    const firstKey = getStepKeyFromPaso(sorted[0])
    edges.push({
      id: `e-start-${firstKey}`,
      source: START_ID,
      target: firstKey,
      sourceHandle: 'out',
      targetHandle: 'in',
    })
  }

  sorted.forEach((p, i) => {
    const id = getStepKeyFromPaso(p)
    const c = p.config && typeof p.config === 'object' ? (p.config as Record<string, unknown>) : {}

    if (p.actionType === 'BRANCH_IF') {
      const thenK = typeof c.thenTargetKey === 'string' ? c.thenTargetKey.trim() : ''
      const elseK = typeof c.elseTargetKey === 'string' ? c.elseTargetKey.trim() : ''
      if (thenK) {
        edges.push({
          id: `e-${id}-then-${thenK}`,
          source: id,
          target: thenK,
          sourceHandle: 'then',
          targetHandle: 'in',
        })
      }
      if (elseK) {
        edges.push({
          id: `e-${id}-else-${elseK}`,
          source: id,
          target: elseK,
          sourceHandle: 'else',
          targetHandle: 'in',
        })
      }
    } else if (i < sorted.length - 1) {
      const nextP = sorted[i + 1]
      const nextId = getStepKeyFromPaso(nextP)
      edges.push({
        id: `e-${id}-next-${nextId}`,
        source: id,
        target: nextId,
        sourceHandle: 'next',
        targetHandle: 'in',
      })
    }
  })

  return { nodes, edges }
}

function topoSortIds(
  nodeIds: Set<string>,
  edgeList: { source: string; target: string }[],
): string[] | null {
  const incoming = new Map<string, number>()
  nodeIds.forEach((id) => incoming.set(id, 0))
  edgeList.forEach((e) => {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return
    incoming.set(e.target, (incoming.get(e.target) || 0) + 1)
  })
  const q: string[] = []
  incoming.forEach((v, k) => {
    if (v === 0) q.push(k)
  })
  const out: string[] = []
  while (q.length) {
    const n = q.shift()!
    out.push(n)
    edgeList.forEach((e) => {
      if (e.source !== n || !nodeIds.has(e.target)) return
      const t = e.target
      const next = (incoming.get(t) || 0) - 1
      incoming.set(t, next)
      if (next === 0) q.push(t)
    })
  }
  if (out.length !== nodeIds.size) return null
  return out
}

function reachableFromStart(
  startId: string,
  allEdges: Edge[],
  stepIds: Set<string>,
): Set<string> {
  const seen = new Set<string>()
  const stack: string[] = []
  allEdges.forEach((e) => {
    if (e.source === startId && stepIds.has(e.target)) stack.push(e.target)
  })
  while (stack.length) {
    const n = stack.pop()!
    if (seen.has(n)) continue
    seen.add(n)
    allEdges.forEach((e) => {
      if (e.source === n && stepIds.has(e.target)) stack.push(e.target)
    })
  }
  return seen
}

/** Grafo React Flow → pasos para la API (orden = posición en base de datos) */
export function flowToPasos(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
): { ok: true; pasos: WorkflowPasoPayload[] } | { ok: false; error: string } {
  const stepNodes = nodes.filter((n) => n.id !== START_ID && n.type !== 'workflowTrigger')
  if (stepNodes.length === 0) {
    return {
      ok: false,
      error: 'Añade al menos un paso al lienzo y conéctalo desde el disparador.',
    }
  }

  const ids = new Set(stepNodes.map((n) => n.id))
  for (const n of stepNodes) {
    if (!n.data?.stepKey?.trim()) {
      return { ok: false, error: 'Cada paso debe tener clave interna.' }
    }
  }

  const outFromStart = edges.filter((e) => e.source === START_ID && ids.has(e.target))
  if (outFromStart.length !== 1) {
    return {
      ok: false,
      error: 'Debe haber exactamente una conexión desde el disparador al primer paso.',
    }
  }

  const reachable = reachableFromStart(START_ID, edges, ids)
  if (reachable.size !== ids.size) {
    return {
      ok: false,
      error: 'Todos los pasos deben ser alcanzables desde el disparador (sin nodos sueltos).',
    }
  }

  const relevantEdges = edges.filter(
    (e) => (e.source === START_ID || ids.has(e.source)) && ids.has(e.target),
  )

  const order = topoSortIds(
    ids,
    relevantEdges.map((e) => ({ source: e.source, target: e.target })),
  )
  if (!order) {
    return {
      ok: false,
      error: 'El flujo tiene un ciclo. Elimina conexiones que cierran el bucle.',
    }
  }

  const pasos: WorkflowPasoPayload[] = order.map((nodeId) => {
    const node = stepNodes.find((n) => n.id === nodeId)!
    const actionType = node.data.actionType
    const config: Record<string, unknown> = {
      ...node.data.config,
      stepKey: node.data.stepKey.trim(),
    }

    if (actionType === 'BRANCH_IF') {
      const thenE = edges.find((e) => e.source === nodeId && e.sourceHandle === 'then')
      const elseE = edges.find((e) => e.source === nodeId && e.sourceHandle === 'else')
      const thenN = thenE ? nodes.find((x) => x.id === thenE.target) : undefined
      const elseN = elseE ? nodes.find((x) => x.id === elseE.target) : undefined
      config.thenTargetKey = thenN?.data?.stepKey?.trim() ?? ''
      config.elseTargetKey = elseN?.data?.stepKey?.trim() ?? ''
    }

    return {
      stepType: 'ACTION',
      actionType,
      config,
    }
  })

  return { ok: true, pasos }
}

export function newWorkflowNode(
  actionType: string,
  at: { x: number; y: number },
  defaultConfig: Record<string, unknown>,
): Node<WorkflowNodeData> {
  const stepKey = genStepKey()
  const cfg = { ...defaultConfig, stepKey }
  return {
    id: stepKey,
    type: 'workflowStep',
    position: at,
    data: {
      actionType,
      config: cfg,
      stepKey,
      label: shortActionLabel(actionType, cfg),
    },
  }
}

export { START_ID as WORKFLOW_START_ID, genStepKey }

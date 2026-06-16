'use client'

import { memo, useCallback, type MouseEvent } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react'

/**
 * Arista tipo bezier con botón × sobre el cable para quitar la conexión sin borrar nodos.
 */
export const WorkflowDeletableEdge = memo(function WorkflowDeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerStart,
  markerEnd,
  interactionWidth,
  pathOptions,
}: EdgeProps) {
  const { setEdges } = useReactFlow()

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: pathOptions?.curvature,
  })

  const remove = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setEdges((eds) => eds.filter((edge) => edge.id !== id))
    },
    [id, setEdges],
  )

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={style}
        interactionWidth={interactionWidth}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            zIndex: 10,
          }}
        >
          <button
            type="button"
            className="nopan nodrag"
            aria-label="Quitar conexión"
            title="Quitar conexión"
            onClick={remove}
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              border: '1px solid #a8a29e',
              background: '#fff',
              color: '#57534e',
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            }}
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
})

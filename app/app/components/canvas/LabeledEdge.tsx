'use client'

import { memo, useState, useRef } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

interface LabeledEdgeData {
  label?: string
}

function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  selected,
  source,
  target,
  markerEnd,
}: EdgeProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const label = (data as LabeledEdgeData)?.label

  // Tooltip positioned near the label, slightly above the wire
  const tooltipX = labelX
  const tooltipY = labelY - 40

  const handleMouseEnter = () => {
    hoverTimerRef.current = setTimeout(() => {
      setTooltipPos({ x: tooltipX, y: tooltipY })
      setShowTooltip(true)
    }, 200)
  }

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setShowTooltip(false)
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected ? '#7c3aed' : '#3e3e4e',
          strokeWidth: selected ? 2.5 : 1.5,
          transition: 'stroke 0.15s, stroke-width 0.15s',
        }}
      />

      {/* Wire label */}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 10,
              fontWeight: 500,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#6b6b7b',
              background: '#12121a',
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid #1e1e2e',
              pointerEvents: 'all',
              userSelect: 'none',
            }}
            className="nodrag nopan"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Hover tooltip */}
      {showTooltip && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${tooltipPos.x}px, ${tooltipPos.y}px)`,
              background: '#12121a',
              color: '#e5e5e5',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              border: '1px solid #1e1e2e',
              pointerEvents: 'none',
              zIndex: 100,
              minWidth: 160,
              maxWidth: 220,
            }}
            className="nodrag nopan"
          >
            <div style={{ fontWeight: 600, marginBottom: 4, color: '#e5e5e5', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
              Data Flow
            </div>
            <div style={{ color: '#6b6b7b', marginBottom: 2 }}>
              <span style={{ color: '#e5e5e5' }}>{label}</span>
            </div>
            <div style={{ fontSize: 11, color: '#3e3e4e', marginTop: 6, borderTop: '1px solid #1e1e2e', paddingTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>
              {source} → {target}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

LabeledEdge.displayName = 'LabeledEdge'

export { LabeledEdge }
export default memo(LabeledEdge)

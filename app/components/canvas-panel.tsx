'use client'

import { useState } from 'react'
import { Split, Square } from 'lucide-react'
import { AgentCard } from './agent-card'
import { ConnectionLine } from './connection-line'
import { TemplateGallery } from './template-gallery'
import { RunButton } from './run-button'
import { AgentGraph, AgentStatusEvent, RunDoneEvent, RunErrorEvent } from '@/lib/nl/types'

interface CanvasPanelProps {
  assembledGraph: AgentGraph | null
  onModeToggle: () => void
  mode: 'split' | 'canvas'
  onStatusUpdate?: (event: AgentStatusEvent) => void
  onRunDone?: (event: RunDoneEvent) => void
  onRunError?: (event: RunErrorEvent) => void
  onRunIdReceived?: (runId: string) => void
}

export function CanvasPanel({
  assembledGraph,
  onModeToggle,
  mode,
  onStatusUpdate,
  onRunDone,
  onRunError,
  onRunIdReceived,
}: CanvasPanelProps) {
  const [agentStatuses, setAgentStatuses] = useState<Record<string, 'ready' | 'running' | 'waiting' | 'completed' | 'error'>>({})

  // Calculate agent positions in a grid layout
  const getAgentPosition = (index: number, total: number) => {
    const cols = Math.min(3, total)
    const row = Math.floor(index / cols)
    const col = index % cols
    const cardWidth = 160
    const cardHeight = 120
    const gapX = 80
    const gapY = 60
    const startX = 100
    const startY = 100

    return {
      x: startX + col * (cardWidth + gapX),
      y: startY + row * (cardHeight + gapY),
    }
  }

  const handleStatusUpdate = (event: AgentStatusEvent) => {
    setAgentStatuses((prev) => ({ ...prev, [event.agentId]: event.status }))
    onStatusUpdate?.(event)
  }

  const handleRunDone = (event: RunDoneEvent) => {
    onRunDone?.(event)
  }

  const handleRunError = (event: RunErrorEvent) => {
    onRunError?.(event)
  }

  return (
    <div
      className="canvas-grid"
      style={{
        flex: 1,
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}
        >
          Your agent team
        </span>

        <button
          onClick={onModeToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            backgroundColor: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {mode === 'split' ? <Square size={14} /> : <Split size={14} />}
          {mode === 'split' ? 'Canvas' : 'Split'}
        </button>
      </div>

      {/* Content */}
      {assembledGraph ? (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* Connection lines */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            <defs>
              <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--border-hover)" />
                <stop offset="100%" stopColor="var(--border-hover)" />
              </linearGradient>
            </defs>
            {assembledGraph.connections.map((conn) => {
              const fromIndex = assembledGraph.agents.findIndex((a) => a.id === conn.from)
              const toIndex = assembledGraph.agents.findIndex((a) => a.id === conn.to)
              if (fromIndex === -1 || toIndex === -1) return null

              const fromPos = getAgentPosition(fromIndex, assembledGraph.agents.length)
              const toPos = getAgentPosition(toIndex, assembledGraph.agents.length)

              // Calculate edge connection points (right side of source, left side of target)
              const startX = fromPos.x + 160 // right edge of source card
              const startY = fromPos.y + 60 // middle of source card
              const endX = toPos.x // left edge of target card
              const endY = toPos.y + 60 // middle of target card

              const isRunning = agentStatuses[conn.from] === 'running' || agentStatuses[conn.to] === 'running'

              return (
                <ConnectionLine
                  key={`${conn.from}-${conn.to}`}
                  startX={startX}
                  startY={startY}
                  endX={endX}
                  endY={endY}
                  isRunning={isRunning}
                />
              )
            })}
          </svg>

          {/* Agent cards */}
          {assembledGraph.agents.map((agent, index) => {
            const pos = getAgentPosition(index, assembledGraph.agents.length)
            const status = agentStatuses[agent.id] || 'ready'
            return (
              <div
                key={agent.id}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                }}
              >
                <AgentCard agent={agent} status={status} />
              </div>
            )
          })}
        </div>
      ) : (
        <TemplateGallery onTemplateSelect={() => {}} />
      )}

      {/* Run button */}
      {assembledGraph && (
        <RunButton
          graph={assembledGraph}
          onStatusUpdate={handleStatusUpdate}
          onRunDone={handleRunDone}
          onRunError={handleRunError}
          onRunIdReceived={onRunIdReceived}
        />
      )}
    </div>
  )
}

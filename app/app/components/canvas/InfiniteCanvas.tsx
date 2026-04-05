'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  type Connection,
} from '@xyflow/react'
import { Maximize2 } from 'lucide-react'
import '@xyflow/react/dist/style.css'

import { CanvasProvider, useCanvas } from './CanvasProvider'
import AgentNode from './AgentNode'
import LabeledEdge from './LabeledEdge'
import { NodeDetailPanel } from './NodeDetailPanel'
import { NLPromptBar } from './NLPromptBar'
import { EscalationCard, DEMO_ESCALATION, type EscalationData } from './EscalationCard'
import { ReasoningPanel } from '@/components/reasoning-panel'
import type { NLToCanvasResult } from '@/app/hooks/useNLToCanvas'
import { subscribeToRunChannel } from '@/lib/tracing/sse-stream'
import {
  setActiveEscalation,
  clearActiveEscalation,
  getActiveEscalation,
} from '@/lib/runtime/escalation-store'
import type { ApprovalRequiredEvent } from '@/lib/tracing/event-schema'

const nodeTypes = {
  agent: AgentNode,
}

const edgeTypes = {
  labeled: LabeledEdge,
}

function FitViewButton() {
  const { fitView } = useReactFlow()
  return (
    <button
      onClick={() => fitView({ padding: 0.2, duration: 400 })}
      title="Fit to view"
      style={{
        background: '#ffffff',
        border: '1px solid #e5e5e3',
        borderRadius: 8,
        padding: '6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
      }}
    >
      <Maximize2 size={14} color="#6b6b68" />
    </button>
  )
}

function CanvasContent() {
  const { nodes, edges, setSelectedNodeId, addGraphAgents, setActiveEscalationId } = useCanvas()
  const [activeEscalation, setActiveEscalationLocal] = useState<EscalationData | null>(null)
  const [isTraceOpen, setIsTraceOpen] = useState(false)

  const onConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target) return
    try {
      const res = await fetch('/api/canvas/wires', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: connection.source,
          targetId: connection.target,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error ?? 'Failed to create connection')
      }
    } catch (err) {
      console.error('[canvas] wire creation error:', err)
    }
  }, [])

  // Listen for node-select events from AgentNode
  useEffect(() => {
    const handleNodeSelect = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>
      setSelectedNodeId(customEvent.detail.id)
    }
    document.addEventListener('node-select', handleNodeSelect)
    return () => document.removeEventListener('node-select', handleNodeSelect)
  }, [setSelectedNodeId])

  // Wire SSE approval_required events to escalation store + local state
  // This is the bridge: approval-manager emits via SSE → canvas shows card
  useEffect(() => {
    const runId = getActiveEscalation().runId ?? 'demo'
    const unsubscribe = subscribeToRunChannel(runId, (sseEvent) => {
      if (sseEvent.type === 'approval_required') {
        const event = sseEvent.data as ApprovalRequiredEvent
        setActiveEscalation(event.content.toolCallId, event.runId)
        // Also update local state for the card
        setActiveEscalationLocal({
          approvalId: event.content.toolCallId,
          runId: event.runId,
          toolCallId: event.content.toolCallId,
          agentName: event.agentId,
          summary: event.content.summary,
          toolName: 'tool',
          args: Object.fromEntries(
            (event.content.fields ?? []).map((f: { name: string; value: unknown }) => [f.name, f.value])
          ),
        })
      } else if (sseEvent.type === 'approval_resolved') {
        clearActiveEscalation()
        setActiveEscalationId(null)
        setActiveEscalationLocal(null)
      }
    })
    return unsubscribe
  }, [setActiveEscalationId, clearActiveEscalation])

  // Listen for escalation-required events (demo / manual trigger)
  useEffect(() => {
    const handleEscalationRequired = (e: Event) => {
      const customEvent = e as CustomEvent<EscalationData>
      setActiveEscalationLocal(customEvent.detail)
    }
    document.addEventListener('escalation-required', handleEscalationRequired)
    return () => document.removeEventListener('escalation-required', handleEscalationRequired)
  }, [])

  // Listen for open-reasoning-panel custom event from NodeDetailPanel or RunButton
  useEffect(() => {
    const handleOpenReasoningPanel = () => {
      setIsTraceOpen(true)
    }
    document.addEventListener('open-reasoning-panel', handleOpenReasoningPanel)
    return () => document.removeEventListener('open-reasoning-panel', handleOpenReasoningPanel)
  }, [])

  const handleActivate = (result: NLToCanvasResult) => {
    // Add the interpreted agents + connections to the canvas
    addGraphAgents(
      result.graph.agents.map(a => ({
        id: a.id,
        name: a.name,
        role: 'worker',
        archetype: a.archetype,
        tools: a.tools,
        description: a.description,
        position_x: a.position_x,
        position_y: a.position_y,
      })),
      result.graph.connections.map(c => ({ source: c.source, target: c.target }))
    )
  }

  // Listen for nl-palette-activate events from the canvas page's command palette
  useEffect(() => {
    const handler = (e: Event) => {
      const result = (e as CustomEvent<NLToCanvasResult>).detail
      handleActivate(result)
    }
    document.addEventListener('nl-palette-activate', handler)
    return () => document.removeEventListener('nl-palette-activate', handler)
  }, [handleActivate])

  // Demo trigger — hidden button to fire escalation for testing
  const handleTriggerEscalation = () => {
    setActiveEscalation(DEMO_ESCALATION.approvalId, DEMO_ESCALATION.runId)
    setActiveEscalationLocal(DEMO_ESCALATION)
  }

  const handleApprove = async () => {
    if (!activeEscalation) return
    await fetch(`/api/approvals/${activeEscalation.approvalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: activeEscalation.runId,
        toolCallId: activeEscalation.toolCallId,
        decision: 'approved',
      }),
    })
    clearActiveEscalation()
    setActiveEscalationId(null)
    setActiveEscalationLocal(null)
  }

  const handleEdit = async (revisedArgs: Record<string, unknown>) => {
    if (!activeEscalation) return
    await fetch(`/api/approvals/${activeEscalation.approvalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: activeEscalation.runId,
        toolCallId: activeEscalation.toolCallId,
        decision: 'edited',
        revisedArgs,
      }),
    })
    clearActiveEscalation()
    setActiveEscalationId(null)
    setActiveEscalationLocal(null)
  }

  const handleCancel = async () => {
    if (!activeEscalation) return
    await fetch(`/api/approvals/${activeEscalation.approvalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: activeEscalation.runId,
        toolCallId: activeEscalation.toolCallId,
        decision: 'cancelled',
      }),
    })
    clearActiveEscalation()
    setActiveEscalationId(null)
    setActiveEscalationLocal(null)
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#f0f0ec',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={2}
        style={{
          background: '#f0f0ec',
        }}
      >
        <Background
          color="#d4d4d1"
          gap={20}
          size={1}
        />
        <Controls
          style={{
            background: '#ffffff',
            border: '1px solid #e5e5e3',
            borderRadius: 8,
          }}
        >
          <FitViewButton />
        </Controls>
      </ReactFlow>
      <NodeDetailPanel />

      <NLPromptBar teamId="team-1" onActivate={handleActivate} onCancel={() => {}} />

      {/* Debug escalation trigger — bottom-right corner */}
      <button
        onClick={handleTriggerEscalation}
        title="Trigger demo escalation (debug)"
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          background: '#f59e0b',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '6px 12px',
          fontSize: 12,
          cursor: 'pointer',
          opacity: 0.6,
          zIndex: 10,
        }}
      >
        Trigger Escalation
      </button>

      {/* Escalation overlay */}
      {activeEscalation && (
        <EscalationCard
          agentName={activeEscalation.agentName}
          summary={activeEscalation.summary}
          toolName={activeEscalation.toolName}
          args={activeEscalation.args}
          onApprove={handleApprove}
          onEdit={handleEdit}
          onCancel={handleCancel}
        />
      )}
    </div>
  )
}

export function InfiniteCanvas() {
  return (
    <CanvasProvider>
      <CanvasContent />
    </CanvasProvider>
  )
}

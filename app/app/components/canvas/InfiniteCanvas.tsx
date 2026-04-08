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
import { TeamLeadNode } from './TeamLeadNode'
import LabeledEdge from './LabeledEdge'
import { NodeDetailPanel } from './NodeDetailPanel'
import { NLPromptBar } from './NLPromptBar'
import { EscalationCard, DEMO_ESCALATION, type EscalationData } from './EscalationCard'
import { TracePanel } from './TracePanel'
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
  teamlead: TeamLeadNode,
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
        background: '#12121a',
        border: '1px solid #1e1e2e',
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
      <Maximize2 size={14} color="#6b6b7b" />
    </button>
  )
}

function CanvasContent() {
  const { nodes, edges, setSelectedNodeId, addGraphAgents, setActiveEscalationId, selectedNode, currentCanvasId, teamId, subscribeToLaneEvents } = useCanvas()
  const [activeEscalation, setActiveEscalationLocal] = useState<EscalationData | null>(null)
  const [isTraceOpen, setIsTraceOpen] = useState(false)
  const [traceRunId, setTraceRunId] = useState<string | null>(null)
  const [teamRunning, setTeamRunning] = useState(false)

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
      } else if (sseEvent.type === 'lane_blocked') {
        // Team escalation — lane blocked event from worker
        const event = sseEvent.data as { task_id: string; agent_id: string; team_id: string; payload?: { reason?: string; artifact?: unknown } }
        setActiveEscalation(event.task_id, event.team_id)
        setActiveEscalationLocal({
          approvalId: event.task_id,
          runId: event.team_id,
          toolCallId: event.task_id,
          agentName: event.agent_id,
          summary: event.payload?.reason ?? 'Worker blocked — needs your input',
          toolName: 'tool',
          args: { blast_radius: event.payload?.artifact },
          teamContext: {
            workerName: event.agent_id,
            taskId: event.task_id,
            teamId: event.team_id,
            blastRadius: typeof event.payload?.artifact === 'object'
              ? JSON.stringify(event.payload.artifact)
              : undefined,
          },
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
    const handleOpenReasoningPanel = (e: Event) => {
      const customEvent = e as CustomEvent<{ runId: string }>
      setTraceRunId(customEvent.detail?.runId ?? null)
      setIsTraceOpen(true)
    }
    document.addEventListener('open-reasoning-panel', handleOpenReasoningPanel)
    return () => document.removeEventListener('open-reasoning-panel', handleOpenReasoningPanel)
  }, [])

  // Unit F: subscribe to lane events when a teamId is set
  useEffect(() => {
    if (!teamId) return
    const unsub = subscribeToLaneEvents(teamId)
    return unsub
  }, [teamId, subscribeToLaneEvents])

  const handleActivate = (result: NLToCanvasResult) => {
    const agents = result.graph.agents.map(a => ({
      id: a.id,
      name: a.name,
      role: 'worker',
      archetype: a.archetype,
      tools: a.tools,
      description: a.description,
      position_x: a.position_x,
      position_y: a.position_y,
    }))
    // Add the interpreted agents + connections to the canvas
    addGraphAgents(
      agents,
      result.graph.connections.map(c => ({ source: c.source, target: c.target }))
    )
    // Persist agents to the DB
    if (agents.length > 0) {
      fetch('/api/agents/from-nl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents, canvasId: currentCanvasId ?? undefined }),
      }).catch(err => console.error('[InfiniteCanvas] failed to persist agents:', err))
    }
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

  // Run Team — activates the multi-agent fan-out via BullMQ
  const handleRunTeam = async () => {
    if (!teamId) return
    setTeamRunning(true)
    try {
      const res = await fetch(`/api/teams/${teamId}/activate`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        console.error('[InfiniteCanvas] Run Team failed:', err.error)
      }
    } catch (err) {
      console.error('[InfiniteCanvas] Run Team error:', err)
    } finally {
      // Keep teamRunning true while team is active; lane events will update node status
      // Reset after a delay as a fallback (team should update via SSE eventually)
      setTimeout(() => setTeamRunning(false), 30_000)
    }
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

  const handleSkip = async () => {
    if (!activeEscalation) return
    await fetch(`/api/approvals/${activeEscalation.approvalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: activeEscalation.runId,
        toolCallId: activeEscalation.toolCallId,
        decision: 'skipped',
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
        background: '#0a0a0f',
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
        style={{ background: '#0a0a0f' }}
      >
        {/* Railway dot-grid background */}
        <Background
          color="#1e1e2e"
          gap={28}
          size={1}
          style={{ background: '#0a0a0f' }}
        />
        <Controls
          style={{
            background: '#12121a',
            border: '1px solid #1e1e2e',
            borderRadius: 8,
          }}
        >
          <FitViewButton />
        </Controls>
      </ReactFlow>
      <NodeDetailPanel />

      <NLPromptBar teamId="team-1" onActivate={handleActivate} onCancel={() => {}} />

      {/* Run Team button — Railway dark pill */}
      {teamId && (
        <button
          onClick={handleRunTeam}
          disabled={teamRunning}
          title={teamRunning ? 'Team is running...' : 'Run all agents in this team'}
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            background: teamRunning ? '#1e1b4b' : '#12121a',
            color: teamRunning ? '#a5b4fc' : '#2dd4bf',
            border: `1px solid ${teamRunning ? '#6366f1' : '#2dd4bf'}`,
            borderRadius: 9999,
            padding: '8px 18px',
            fontSize: 13,
            fontWeight: 600,
            cursor: teamRunning ? 'not-allowed' : 'pointer',
            opacity: teamRunning ? 0.8 : 1,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: teamRunning ? 'none' : '0 0 16px rgba(45, 212, 191, 0.2)',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.02em',
            transition: 'all 150ms ease',
          }}
        >
          {teamRunning ? (
            <>
              <span style={{ animation: 'pulse 1.5s ease-in-out infinite', width: 8, height: 8, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
              Running...
            </>
          ) : (
            <>
              <span style={{ fontSize: 14, lineHeight: 1 }}>▶</span>
              Run Team
            </>
          )}
        </button>
      )}

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
          onSkip={handleSkip}
          onCancel={handleCancel}
          teamContext={activeEscalation.teamContext}
        />
      )}

      {/* Reasoning trace panel — bottom-right, above debug trigger */}
      {(isTraceOpen || selectedNode?.data?.runId) && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            zIndex: 40,
            maxWidth: 440,
            width: '100%',
          }}
        >
          <TracePanel
            runId={traceRunId ?? selectedNode?.data?.runId ?? null}
            isOpen={isTraceOpen}
            onToggle={() => setIsTraceOpen(false)}
            maxHeight={400}
          />
        </div>
      )}
    </div>
  )
}

export function InfiniteCanvas({ canvasId }: { canvasId?: string | null }) {
  return (
    <CanvasProvider canvasId={canvasId}>
      <CanvasContent />
    </CanvasProvider>
  )
}

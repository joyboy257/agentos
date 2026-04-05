'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { useNodesState, useEdgesState } from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import { ulid } from 'ulid'

export type NodeStatus = 'running' | 'idle' | 'stopped' | 'scheduled' | 'error' | 'waiting' | 'paused_budget'

export interface AgentNodeData extends Record<string, unknown> {
  name: string
  role: 'Team Lead' | 'Worker'
  archetype?: 'Ingest' | 'Process' | 'Distill'
  status: NodeStatus
  tools?: string[]
  runCountToday?: number
  escalatedCountToday?: number
  lastRunAt?: string | null
  nextWakeAt?: string | null
  budgetUsedPercent?: number
  workerCount?: number
  runId?: string
  nodeId?: string
}

export type CanvasNode = Node<AgentNodeData, 'agent'>

interface CanvasContextValue {
  nodes: CanvasNode[]
  edges: Edge[]
  setNodes: (nodes: CanvasNode[] | ((prev: CanvasNode[]) => CanvasNode[])) => void
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void
  selectedNode: CanvasNode | null
  activeEscalationId: string | null
  setActiveEscalationId: (id: string | null) => void
  addGraphAgents: (agents: Array<{
    id: string
    name: string
    role: string
    archetype?: 'Ingest' | 'Process' | 'Distill'
    tools: string[]
    description?: string
    position_x: number
    position_y: number
  }>, connections: Array<{ source: string; target: string }>) => void
}

const CanvasContext = createContext<CanvasContextValue | null>(null)

const initialNodes: CanvasNode[] = [
  {
    id: 'team-lead-1',
    type: 'agent',
    position: { x: 400, y: 100 },
    data: {
      name: "Maria's Research Lead",
      role: 'Team Lead',
      status: 'running',
      lastRunAt: '2 min ago',
      workerCount: 3,
      nextWakeAt: null,
      budgetUsedPercent: 35,
    },
  },
  {
    id: 'worker-1',
    type: 'agent',
    position: { x: 150, y: 320 },
    data: {
      name: 'HubSpot Ingest Worker',
      role: 'Worker',
      archetype: 'Ingest',
      status: 'running',
      tools: ['HubSpot', 'Gmail'],
      runCountToday: 47,
      escalatedCountToday: 3,
      lastRunAt: '2 min ago',
      nextWakeAt: null,
      budgetUsedPercent: 62,
    },
  },
  {
    id: 'worker-2',
    type: 'agent',
    position: { x: 600, y: 320 },
    data: {
      name: 'Email Follow-up Agent',
      role: 'Worker',
      archetype: 'Process',
      status: 'idle',
      tools: ['Gmail', 'LLM'],
      runCountToday: 12,
      escalatedCountToday: 0,
      lastRunAt: '1 hour ago',
      nextWakeAt: 'tomorrow at 9:00 AM',
      budgetUsedPercent: 18,
    },
  },
  {
    id: 'worker-3',
    type: 'agent',
    position: { x: 150, y: 520 },
    data: {
      name: 'Weekly Digest Worker',
      role: 'Worker',
      archetype: 'Distill',
      status: 'scheduled',
      tools: ['Gmail', 'LLM', 'Calendar'],
      runCountToday: 0,
      escalatedCountToday: 0,
      lastRunAt: '1 day ago',
      nextWakeAt: 'Monday at 8:00 AM',
      budgetUsedPercent: 5,
    },
  },
]

const initialEdges: Edge[] = [
  {
    id: 'e1',
    source: 'team-lead-1',
    target: 'worker-1',
    type: 'labeled',
    data: { label: 'triggers' },
  },
  {
    id: 'e2',
    source: 'team-lead-1',
    target: 'worker-2',
    type: 'labeled',
    data: { label: 'triggers' },
  },
  {
    id: 'e3',
    source: 'worker-1',
    target: 'worker-2',
    type: 'labeled',
    data: { label: 'feeds' },
  },
  {
    id: 'e4',
    source: 'worker-2',
    target: 'worker-3',
    type: 'labeled',
    data: { label: 'feeds' },
  },
]

export function CanvasProvider({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useNodesState(initialNodes)
  const [edges, setEdges] = useEdgesState(initialEdges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [activeEscalationId, setActiveEscalationId] = useState<string | null>(null)

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null

  const addGraphAgents = (
    agents: Array<{
      id: string
      name: string
      role: string
      archetype?: 'Ingest' | 'Process' | 'Distill'
      tools: string[]
      description?: string
      position_x: number
      position_y: number
    }>,
    connections: Array<{ source: string; target: string }>
  ) => {
    const newNodes: CanvasNode[] = agents.map((agent) => ({
      id: agent.id,
      type: 'agent',
      position: { x: agent.position_x, y: agent.position_y },
      data: {
        name: agent.name,
        role: 'Worker',
        archetype: agent.archetype,
        status: 'idle' as NodeStatus,
        tools: agent.tools,
        runCountToday: 0,
        escalatedCountToday: 0,
        lastRunAt: null,
        nextWakeAt: null,
        budgetUsedPercent: 0,
      },
    }))

    const newEdges: Edge[] = connections.map((conn) => ({
      id: `nl-${ulid()}`,
      source: conn.source,
      target: conn.target,
      type: 'labeled',
      data: { label: 'feeds' },
    }))

    // Also wire each new worker to the Team Lead
    const teamLeadEdge: Edge = {
      id: `nl-tl-${ulid()}`,
      source: 'team-lead-1',
      target: agents[0]?.id ?? '',
      type: 'labeled',
      data: { label: 'triggers' },
    }

    setNodes((prev) => [...prev, ...newNodes])
    setEdges((prev) => [...prev, ...newEdges, teamLeadEdge].filter(e => e.target !== ''))
  }

  return (
    <CanvasContext.Provider
      value={{
        nodes,
        edges,
        setNodes,
        setEdges,
        selectedNodeId,
        setSelectedNodeId,
        selectedNode,
        activeEscalationId,
        setActiveEscalationId,
        addGraphAgents,
      }}
    >
      {children}
    </CanvasContext.Provider>
  )
}

export function useCanvas() {
  const ctx = useContext(CanvasContext)
  if (!ctx) throw new Error('useCanvas must be used within CanvasProvider')
  return ctx
}

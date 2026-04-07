'use client'

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
import { useNodesState, useEdgesState } from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import { ulid } from 'ulid'

export type NodeStatus = 'running' | 'idle' | 'stopped' | 'scheduled' | 'error' | 'waiting' | 'paused_budget'

// Lane event types from the multi-agent orchestration plan (Unit D)
export type LaneEventName =
  | 'lane.started'
  | 'lane.blocked'
  | 'lane.progress'
  | 'lane.commit.created'
  | 'lane.merged'
  | 'lane.completed'
  | 'lane.failed'
  | 'lane.waiting'

export interface LaneEvent {
  type: LaneEventName
  team_id: string
  task_id: string
  agent_id: string
  status: 'running' | 'blocked' | 'green' | 'failed' | 'completed'
  timestamp: number
  payload?: {
    commit_sha?: string
    artifact?: unknown
    error?: string
    step?: number
    tool_name?: string
    tool_input?: Record<string, unknown>
  }
}

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
  // Coordinator-specific fields
  isCoordinator?: boolean
  teamMembers?: Array<{ agentId: string; name: string; status: string }>
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
  loadCanvas: (canvasId: string) => Promise<void>
  currentCanvasId: string | null
  canvasLoading: boolean
  // Multi-agent orchestration (Unit F)
  teamId?: string
  teamMembers: Map<string, { name: string; status: string }>
  laneEvents: LaneEvent[]
  subscribeToLaneEvents: (teamId: string) => () => void
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

export function CanvasProvider({ children, canvasId }: { children: ReactNode; canvasId?: string | null }) {
  const [nodes, setNodes] = useNodesState<CanvasNode>([])
  const [edges, setEdges] = useEdgesState(initialEdges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [activeEscalationId, setActiveEscalationId] = useState<string | null>(null)
  const [currentCanvasId, setCurrentCanvasId] = useState<string | null>(canvasId ?? null)
  const [canvasLoading, setCanvasLoading] = useState(false)

  // Multi-agent orchestration state (Unit F)
  const [teamId, setTeamId] = useState<string | undefined>(undefined)
  const [teamMembers, setTeamMembers] = useState<Map<string, { name: string; status: string }>>(new Map())
  const [laneEvents, setLaneEvents] = useState<LaneEvent[]>([])

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null

  const loadCanvas = async (id: string) => {
    setCanvasLoading(true)
    setCurrentCanvasId(id)
    try {
      const res = await fetch(`/api/canvases/${id}`)
      if (!res.ok) throw new Error('Failed to load canvas')
      const data = await res.json()
      const canvas = data.canvas

      // Parse agents from DB format to CanvasNode format
      let agents: Array<{
        id: string
        name: string
        role: string
        archetype?: 'Ingest' | 'Process' | 'Distill'
        tools: string[]
        description?: string
        position_x: number
        position_y: number
      }> = []
      let connections: Array<{ source: string; target: string }> = []

      if (canvas?.agents_json) {
        try {
          agents = JSON.parse(canvas.agents_json)
        } catch {}
      }
      if (canvas?.connections_json) {
        try {
          connections = JSON.parse(canvas.connections_json)
        } catch {}
      }

      // Convert agents to CanvasNode format
      const loadedNodes: CanvasNode[] = agents.map((agent) => ({
        id: agent.id,
        type: 'agent',
        position: { x: agent.position_x ?? 0, y: agent.position_y ?? 0 },
        data: {
          name: agent.name,
          role: agent.role === 'Team Lead' ? 'Team Lead' as const : 'Worker' as const,
          archetype: agent.archetype,
          status: 'idle' as NodeStatus,
          tools: agent.tools ?? [],
          runCountToday: 0,
          escalatedCountToday: 0,
          lastRunAt: null,
          nextWakeAt: null,
          budgetUsedPercent: 0,
        },
      }))

      // Convert connections to Edge format
      const loadedEdges: Edge[] = connections.map((conn, i) => ({
        id: `canvas-edge-${i}`,
        source: conn.source,
        target: conn.target,
        type: 'labeled',
        data: { label: 'feeds' },
      }))

      // Seed a Team Lead if canvas has agents but no team lead
      const hasTeamLead = loadedNodes.some(n => n.data.role === 'Team Lead')
      if (loadedNodes.length > 0 && !hasTeamLead) {
        loadedNodes.unshift({
          id: 'team-lead-1',
          type: 'agent',
          position: { x: 400, y: 100 },
          data: {
            name: `${canvas?.name ?? 'Team'} Lead`,
            role: 'Team Lead',
            status: 'idle',
            workerCount: loadedNodes.length,
            nextWakeAt: null,
            budgetUsedPercent: 0,
          },
        })
        loadedEdges.unshift({
          id: 'team-lead-seed',
          source: 'team-lead-1',
          target: loadedNodes[1]?.id ?? '',
          type: 'labeled',
          data: { label: 'triggers' },
        })
      }

      setNodes(loadedNodes)
      setEdges(loadedEdges)
      setSelectedNodeId(null)

      // Fetch the team for this canvas and set teamId — this triggers
      // the useEffect in CanvasContent that calls subscribeToLaneEvents(teamId)
      try {
        const teamRes = await fetch(`/api/teams?canvasId=${id}`)
        if (teamRes.ok) {
          const teamData = await teamRes.json()
          const teams = teamData.teams ?? []
          if (teams.length > 0) {
            setTeamId(teams[0].id)
          } else {
            setTeamId(undefined)
          }
        }
      } catch (teamErr) {
        console.warn('[CanvasProvider] Failed to load team for canvas:', teamErr)
        setTeamId(undefined)
      }
    } catch (err) {
      console.error('[CanvasProvider] loadCanvas error:', err)
    } finally {
      setCanvasLoading(false)
    }
  }

  // Load canvas when canvasId prop changes
  useEffect(() => {
    if (canvasId) {
      loadCanvas(canvasId)
    } else {
      setNodes([])
      setEdges([])
      setCurrentCanvasId(null)
      setTeamId(undefined)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId])

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

  /**
   * Subscribe to lane events for a team via SSE.
   * Updates teamMembers map and laneEvents state as events arrive.
   * lane.started | lane.progress | lane.blocked | lane.completed | lane.failed | lane.waiting
   *
   * Returns an unsubscribe function.
   */
  const subscribeToLaneEvents = (tid: string): (() => void) => {
    setTeamId(tid)

    const url = `/api/teams/${tid}/lane-events`
    const eventSource = new EventSource(url)

    eventSource.onmessage = (event) => {
      try {
        const laneEvent: LaneEvent = JSON.parse(event.data)

        // Append to laneEvents history (cap at 200)
        setLaneEvents((prev) => {
          const next = [...prev, laneEvent]
          return next.length > 200 ? next.slice(-200) : next
        })

        // Update teamMembers map: agentId → { name, status }
        // Use the canvas node's display name when available
        setTeamMembers((prev) => {
          const next = new Map(prev)
          const nodeName = nodes.find(n => n.id === laneEvent.agent_id)?.data.name ?? laneEvent.agent_id
          next.set(laneEvent.agent_id, {
            name: nodeName,
            status: laneEvent.status,
          })
          return next
        })

        // Also propagate to the corresponding node's status if it exists in the graph
        setNodes((prev) =>
          prev.map((n) =>
            n.id === laneEvent.agent_id || n.data.name === laneEvent.agent_id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    status:
                      laneEvent.status === 'running'
                        ? ('running' as NodeStatus)
                        : laneEvent.status === 'completed'
                          ? ('idle' as NodeStatus)
                          : laneEvent.status === 'failed'
                            ? ('error' as NodeStatus)
                            : laneEvent.status === 'blocked'
                              ? ('waiting' as NodeStatus)
                              : n.data.status,
                  },
                }
              : n
          )
        )
      } catch (err) {
        console.error('[CanvasProvider] lane event parse error:', err)
      }
    }

    eventSource.onerror = () => {
      console.warn('[CanvasProvider] lane events SSE error — closing connection')
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
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
        loadCanvas,
        currentCanvasId,
        canvasLoading,
        // Unit F: multi-agent orchestration
        teamId,
        teamMembers,
        laneEvents,
        subscribeToLaneEvents,
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

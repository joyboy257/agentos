'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
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
type TeamMemberSnapshot = { agentId: string; name: string; status: string }

function laneEventToNodeStatus(laneEvent: LaneEvent): NodeStatus {
  if (laneEvent.status === 'running') return 'running'
  if (laneEvent.status === 'failed') return 'error'
  if (laneEvent.status === 'blocked' || laneEvent.type === 'lane.waiting') return 'waiting'
  if (laneEvent.status === 'completed' || laneEvent.status === 'green') return 'idle'
  return 'idle'
}

function nodeStatusToTeamMemberStatus(status: NodeStatus): string {
  if (status === 'error') return 'failed'
  if (status === 'waiting' || status === 'paused_budget') return 'blocked'
  if (status === 'running') return 'running'
  if (status === 'scheduled') return 'scheduled'
  return 'idle'
}

function summarizeCoordinatorStatus(teamMembers: TeamMemberSnapshot[], fallback: NodeStatus): NodeStatus {
  if (teamMembers.some((member) => member.status === 'running')) return 'running'
  if (teamMembers.some((member) => member.status === 'failed')) return 'error'
  if (teamMembers.some((member) => member.status === 'blocked')) return 'waiting'
  if (teamMembers.length === 0) return fallback === 'running' ? 'idle' : fallback
  return 'idle'
}

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
  const autosaveSkipRef = useRef(true)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nodesRef = useRef<CanvasNode[]>([])

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const persistCanvas = useCallback(async (
    targetCanvasId: string,
    nextNodes: CanvasNode[],
    nextEdges: Edge[]
  ) => {
    const serializedNodes = nextNodes
      .filter((node) => node.data.role !== 'Team Lead')
      .map((node) => ({
        id: node.id,
        name: node.data.name,
        role: node.data.role,
        archetype: node.data.archetype,
        tools: node.data.tools ?? [],
        position_x: node.position.x,
        position_y: node.position.y,
      }))

    const serializedEdges = nextEdges
      .filter((edge) => edge.source && edge.target)
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
      }))

    await fetch(`/api/canvases/${targetCanvasId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agents_json: serializedNodes,
        connections_json: serializedEdges,
      }),
    }).catch((err) => {
      console.error('[CanvasProvider] autosave failed:', err)
    })
  }, [])

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
          isCoordinator: agent.role === 'Team Lead',
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
            isCoordinator: true,
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
      setTeamMembers(new Map())
      setLaneEvents([])

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
      autosaveSkipRef.current = true
      loadCanvas(canvasId)
    } else {
      setNodes([])
      setEdges([])
      setCurrentCanvasId(null)
      setTeamId(undefined)
      setTeamMembers(new Map())
      setLaneEvents([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId])

  // Track structural vs runtime node changes to avoid autosave hammering
  // Runtime fields (status, run metrics) change frequently during team runs and
  // should not trigger canvas autosave — only structural/layout changes matter.
  const structuralNodesRef = useRef<CanvasNode[]>([])

  useEffect(() => {
    if (!currentCanvasId || canvasLoading) return

    if (autosaveSkipRef.current) {
      autosaveSkipRef.current = false
      return
    }

    // Skip autosave when only runtime fields (status, run metrics) changed.
    // persistCanvas serializes nodes without runtime fields, so structural
    // equality is sufficient to detect real layout changes.
    const structuralChanged = nodes.some((node, i) => {
      const prev = structuralNodesRef.current[i]
      if (!prev) return true
      return (
        prev.position.x !== node.position.x ||
        prev.position.y !== node.position.y ||
        prev.data.name !== node.data.name ||
        prev.data.role !== node.data.role ||
        JSON.stringify(prev.data.tools) !== JSON.stringify(node.data.tools) ||
        prev.data.archetype !== node.data.archetype
      )
    })

    if (!structuralChanged) return

    structuralNodesRef.current = nodes.map((n) => ({ ...n }))

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
    }

    autosaveTimerRef.current = setTimeout(() => {
      void persistCanvas(currentCanvasId, nodes, edges)
    }, 400)

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [currentCanvasId, canvasLoading, edges, nodes, persistCanvas])

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

    // Wire every new worker to the Team Lead
    const teamLeadEdges: Edge[] = agents.map((agent) => ({
      id: `nl-tl-${ulid()}`,
      source: 'team-lead-1',
      target: agent.id,
      type: 'labeled',
      data: { label: 'triggers' },
    }))

    setNodes((prev) => [...prev, ...newNodes])
    setEdges((prev) => [...prev, ...newEdges, ...teamLeadEdges].filter(e => e.target !== ''))
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

        // Keep an external lane-status snapshot for navigator and coordinator views.
        setTeamMembers((prev) => {
          const next = new Map(prev)
          const matchingNode = nodesRef.current.find(
            (node) => node.id === laneEvent.agent_id || node.data.name === laneEvent.agent_id
          )
          const nodeName = matchingNode?.data.name ?? next.get(laneEvent.agent_id)?.name ?? laneEvent.agent_id
          next.set(laneEvent.agent_id, {
            name: nodeName,
            status: laneEvent.status,
          })
          return next
        })

        const nextNodeStatus = laneEventToNodeStatus(laneEvent)

        setNodes((prev) => {
          const workerNodes = prev.map((node) => {
            if (node.data.role === 'Team Lead') return node
            if (node.id !== laneEvent.agent_id && node.data.name !== laneEvent.agent_id) return node

            return {
              ...node,
              data: {
                ...node.data,
                status: nextNodeStatus,
              },
            }
          })

          const nextTeamMembers = workerNodes
            .filter((node) => node.data.role === 'Worker')
            .map((node) => ({
              agentId: node.id,
              name: node.data.name,
              status: nodeStatusToTeamMemberStatus(node.data.status),
            }))

          const coordinatorStatus = summarizeCoordinatorStatus(nextTeamMembers, nextNodeStatus)
          const nextNodes = workerNodes.map((node) => {
            if (node.data.role !== 'Team Lead') return node

            return {
              ...node,
              data: {
                ...node.data,
                isCoordinator: true,
                workerCount: nextTeamMembers.length,
                teamMembers: nextTeamMembers,
                status: coordinatorStatus,
              },
            }
          })

          nodesRef.current = nextNodes
          return nextNodes
        })
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

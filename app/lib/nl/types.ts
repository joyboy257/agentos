export type AgentId = string

export type Connection = {
  from: AgentId
  to: AgentId
}

export type AgentRole =
  | 'response_drafter'
  | 'faq_responder'
  | 'escalation_triage'
  | 'lead_researcher'
  | 'lead_enricher'
  | 'llm'
  | 'team_lead'
  | 'worker'

export type Agent = {
  id: AgentId
  role: AgentRole
  tools: string[]
  name: string
  description: string
}

export type AgentGraph = {
  agents: Agent[]
  connections: Connection[]
}

export type ClarificationOption = {
  label: string
  goal: string
}

export type InterpretResult =
  | { ok: true; graph: AgentGraph }
  | { ok: false; clarification: true; question: string; options: ClarificationOption[] }
  | { ok: false; error: true; message: string }

export type AgentStatusEvent = {
  event: 'status'
  runId: string
  agentId: string
  status: 'ready' | 'running' | 'waiting' | 'completed' | 'error' | 'budget_exceeded' | 'paused_budget'
  result?: AgentOutput
  timestamp: number
}

export type RunDoneEvent = {
  event: 'done'
  runId: string
  summary: string
  agentsCompleted: number
  agentsErrored: number
  totalRetries?: number
  durationMs: number
  timestamp: number
}

export type RunErrorEvent = {
  event: 'error'
  runId: string
  message: string
  agentId?: string
  timestamp: number
}

export type AgentOutput = {
  agentId: string
  role: string
  status: 'completed' | 'error'
  data: any
  error?: string
}

export type RunEvent = AgentStatusEvent | RunDoneEvent | RunErrorEvent

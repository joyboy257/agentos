import { AgentGraph, AgentStatusEvent, RunDoneEvent, RunErrorEvent, AgentOutput } from '@/lib/nl/types'

export type ExecutionCallbacks = {
  onStatus: (event: AgentStatusEvent) => void
  onDone: (event: RunDoneEvent) => void
  onError: (event: RunErrorEvent) => void
}

export type RunOptions = {
  runId: string
  graph: AgentGraph
  signal?: AbortSignal
}

export interface Runner {
  execute(callbacks: ExecutionCallbacks, options: RunOptions): Promise<void>
}

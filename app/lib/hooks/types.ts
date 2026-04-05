/**
 * Hook system types — R6
 *
 * Hooks are async by default. Pre-agent intercept hooks (not implemented in v1)
 * would be sync and use a special `intercept` flag.
 */

// ---------------------------------------------------------------------------
// Hook Types
// ---------------------------------------------------------------------------

export type HookType =
  | 'preAgentRun'      // Before agent starts executing
  | 'postAgentRun'     // After agent completes (success, error, or cancelled)
  | 'preToolCall'      // Before a tool is called
  | 'postToolCall'     // After a tool returns
  | 'preApproval'      // Before approval is requested
  | 'postApproval'     // After approval is resolved (approved, denied, cancelled, timeout)
  | 'runComplete'      // After entire run finishes
  | 'runError'         // When run encounters a fatal error
  | 'budgetPaused'    // When agent pauses due to budget exhaustion

// ---------------------------------------------------------------------------
// Hook Context — serializable payload passed to each hook handler
// ---------------------------------------------------------------------------

export interface HookContext {
  runId: string
  agentId?: string
  toolName?: string
  approvalId?: string
  timestamp: number

  // Type-specific fields (discriminated by presence of the field)
  preAgentRun?: {
    agentRole: string
    tools: string[]
  }
  postAgentRun?: {
    agentRole: string
    status: 'completed' | 'error'
    output?: unknown
  }
  preToolCall?: {
    toolName: string
    args: Record<string, unknown>
  }
  postToolCall?: {
    toolName: string
    result: unknown
    durationMs: number
  }
  preApproval?: {
    toolName: string
    summary: string
    fields: ApprovalField[]
  }
  postApproval?: {
    decision: 'approved' | 'denied' | 'cancelled' | 'timeout'
  }
  runComplete?: {
    agentsCompleted: number
    agentsErrored: number
    durationMs: number
  }
  runError?: {
    error: string
  }
  budgetPaused?: {
    elapsedMs: number
    budgetMs: number
  }
}

export interface ApprovalField {
  name: string
  value: unknown
  label?: string
}

// ---------------------------------------------------------------------------
// Hook Result — returned by each handler
// ---------------------------------------------------------------------------

export interface HookResult {
  success: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Hook Handler signature
// ---------------------------------------------------------------------------

export type HookHandler = (ctx: HookContext) => Promise<HookResult>

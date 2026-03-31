/**
 * Capability Registry — TypeScript Interfaces
 * ARCHITECTURE-01-capability-registry.md
 */

/**
 * JSON Schema subset — kept minimal for cross-language portability.
 * Each field may have a semanticType tag for field-level dependency resolution.
 */
export interface JSONSchema {
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  /** Semantic type tag for field-level dependency resolution */
  semanticType?: string;
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
}

/** Approval configuration for a capability */
export interface ApprovalConfig {
  /** Who must approve this action */
  approverType: 'user' | 'approver' | 'none';
  /** Seconds to wait for approval before taking fallback action */
  timeoutSeconds?: number;
  /** Fallback action when approval times out */
  fallback?: 'skip' | 'abort' | 'retry' | string;
}

/**
 * A capability is an atomic unit of computable action the system can perform.
 * The registry is the authoritative source of truth for what the system can do.
 */
export interface Capability {
  /** Unique identifier in namespace:subdomain format (e.g. "email:read") */
  id: string;
  /** Human-readable description */
  description: string;
  /** Natural language phrases that should trigger this capability */
  triggers: string[];
  /** Which tools this capability invokes */
  tools: string[];
  /** JSON Schema describing input parameters */
  inputSchema: JSONSchema;
  /** JSON Schema describing output parameters */
  outputSchema: JSONSchema;
  /** Approval configuration */
  approvalConfig: ApprovalConfig;
  /** Control-flow primitive marker */
  isControlFlow?: boolean;
  /** Estimated worst-case execution duration in milliseconds */
  estimatedDurationMs?: number;
  /** Example prompt strings that correctly invoke this capability */
  examples?: string[];
  /** Maps this capability to an underscore-formatted role identifier (for test-suite compatibility) */
  agentRole: string;
}

/** Result of matching a user goal against the registry */
export interface CapabilityMatch {
  capability: Capability;
  /** 0.0–1.0 confidence score */
  score: number;
  /** Which triggers matched above threshold */
  matchedTriggers: string[];
  /** Inferred input values from the goal */
  inferredInputs: Record<string, unknown>;
}

/** A single step in an execution plan */
export interface ExecutionStep {
  capabilityId: string;
  inputs: Record<string, unknown>;
  /** IDs of steps whose outputs this step consumes */
  dependsOn: string[];
}

/** Complete execution plan derived from matched capabilities */
export interface ExecutionPlan {
  steps: ExecutionStep[];
  /** Sum of all step durations; -1 if indeterminate */
  estimatedDurationMs: number;
  /** True if any step requires approval */
  requiresApproval: boolean;
}

/** Query input for the capability registry */
export interface RegistryQuery {
  /** Raw user goal */
  goal: string;
  /** Current session/execution context */
  context?: ExecutionContext;
  /** Max results (default 5) */
  limit?: number;
}

/** Execution context for context-aware registry queries */
export interface ExecutionContext {
  /** Active capability IDs already assigned in the current plan */
  activeCapabilities?: string[];
  /** Channel/platform through which the user is interacting */
  channel?: string;
  /** User's authenticated identity */
  userId?: string;
  /** Current session identifier */
  sessionId?: string;
  /** Organisation/workspace context */
  orgId?: string;
  /** Arbitrary additional context */
  extras?: Record<string, unknown>;
}

/** Missing input field — used by inferInputs to prompt the user */
export interface MissingField {
  name: string;
  description?: string;
  semanticType?: string;
  schema: JSONSchema;
}

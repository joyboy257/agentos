import { z } from 'zod';

export type Archetype = 'ingest' | 'process' | 'distill';
export type PermissionLevel = 'safe' | 'needs_approval' | 'admin_only';

export const ToolCallSchema = z.object({
  name: z.string(),
  args: z.record(z.unknown()),
  id: z.string(), // ULID idempotency key
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export interface ToolDefinition {
  name: string;
  description: string;
  isConcurrencySafe: boolean; // true = read-only, can parallelize
  isDestructive: boolean; // true = modifies external state
  permissionLevel: PermissionLevel;
  execute(args: unknown, context: ToolContext): Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  retriesAttempted?: number;
}

export interface ToolContext {
  runId: string;
  agentId: string;
  userId: string;
  orgId: string;
  signal?: AbortSignal;
}

export interface Capability {
  id: string;
  name: string;
  description: string;
  archetype: Archetype;
  triggerPhrases: string[]; // for NL matching
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  tools: string[]; // tool names this capability uses
  permissionLevel: PermissionLevel;
}
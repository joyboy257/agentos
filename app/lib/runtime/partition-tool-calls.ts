import { z } from 'zod';
import type { ToolCall } from '../capability-registry/types';
import { ToolCallSchema } from '../capability-registry/types';
import { capabilityRegistry } from '../capability-registry';
import { registry } from '@/lib/registry/capability-registry';

export const PartitionedToolCallsSchema = z.object({
  readTools: z.array(ToolCallSchema),
  writeTools: z.array(ToolCallSchema),
});
export type PartitionedToolCalls = z.infer<typeof PartitionedToolCallsSchema>;

/**
 * Determines if a tool should be treated as a "read" (safe to parallelize).
 *
 * Checks in order:
 * 1. capabilityRegistry.getToolDef (slack, stripe) → uses isConcurrencySafe
 * 2. registry.get (hubspot, google-calendar, etc.) → uses approvalConfig.approverType
 *    - 'none' = read-only, safe for parallel
 *    - 'user' = requires approval, treat as write (serial)
 */
function isReadTool(toolName: string): boolean {
  // 1. Check capabilityRegistry (slack, stripe, drive)
  const toolDef = capabilityRegistry.getToolDef(toolName);
  if (toolDef) {
    return toolDef.isConcurrencySafe === true;
  }

  // 2. Check registry (hubspot, google-calendar, twilio, quickbooks)
  // These register Capabilities where approvalConfig.approverType === 'none' means read-only
  const cap = registry.get(toolName);
  if (cap) {
    return cap.approvalConfig?.approverType === 'none';
  }

  // 3. Unknown tool → treat as write (safe default)
  return false;
}

/**
 * Partitions tool calls into:
 * - readTools: isConcurrencySafe = true → can run in parallel
 * - writeTools: isConcurrencySafe = false → must run serially, after reads
 *
 * Read tools (web.search, hubspot.contacts.list, etc.) run in parallel.
 * Write tools (hubspot.contacts.create, gmail.send, etc.) run serially and only after reads complete.
 */
export function partitionToolCalls(toolCalls: ToolCall[]): PartitionedToolCalls {
  const readTools: ToolCall[] = [];
  const writeTools: ToolCall[] = [];

  for (const toolCall of toolCalls) {
    if (isReadTool(toolCall.name)) {
      readTools.push(toolCall);
    } else {
      // Default to write (serial) for unknown tools — safe default
      writeTools.push(toolCall);
    }
  }

  return { readTools, writeTools };
}

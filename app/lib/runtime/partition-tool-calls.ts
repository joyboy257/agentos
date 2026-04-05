import { z } from 'zod';
import type { ToolCall } from '../capability-registry/types';
import { ToolCallSchema } from '../capability-registry/types';
import { capabilityRegistry } from '../capability-registry';

export const PartitionedToolCallsSchema = z.object({
  readTools: z.array(ToolCallSchema),
  writeTools: z.array(ToolCallSchema),
});
export type PartitionedToolCalls = z.infer<typeof PartitionedToolCallsSchema>;

/**
 * Partitions tool calls into:
 * - readTools: isConcurrencySafe = true → can run in parallel
 * - writeTools: isConcurrencySafe = false → must run serially, after reads
 *
 * Read tools (web.search, hubspot.read, etc.) run in parallel.
 * Write tools (hubspot.write, etc.) run serially and only after reads complete.
 */
export function partitionToolCalls(toolCalls: ToolCall[]): PartitionedToolCalls {
  const readTools: ToolCall[] = [];
  const writeTools: ToolCall[] = [];

  for (const toolCall of toolCalls) {
    const toolDef = capabilityRegistry.getToolDef(toolCall.name);

    if (toolDef && toolDef.isConcurrencySafe) {
      readTools.push(toolCall);
    } else {
      // Default to write (serial) for unknown tools — safe default
      writeTools.push(toolCall);
    }
  }

  return { readTools, writeTools };
}

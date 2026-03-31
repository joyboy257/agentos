/**
 * Tool Mapper — Bidirectional MCP tool name → AgentOS capability mapping
 * ARCHITECTURE-02-mcp-client.md §Tool Name Mapping
 *
 * Maps MCP tool names to AgentOS capability IDs and vice versa.
 * Also enforces DANGEROUS_TOOLS restrictions.
 */

import type { Capability } from '@/lib/registry/types'

/** Maps MCP tool names to AgentOS capability IDs */
const MCP_TO_CAPABILITY: Record<string, string> = {
  'stripe.chargeCustomer': 'payments:charge',
  'stripe.refundPayment': 'payments:refund',
  'shell.execute': 'admin:execute_code',
  'zapier.webhook.trigger': 'webhook:trigger',
}

/** Maps AgentOS capability IDs to MCP tool names */
const CAPABILITY_TO_MCP: Record<string, string> = {
  'payments:charge': 'stripe.chargeCustomer',
  'payments:refund': 'stripe.refundPayment',
  'admin:execute_code': 'shell.execute',
  'webhook:trigger': 'zapier.webhook.trigger',
}

/** Tools that require explicit capability grants before invocation */
export const DANGEROUS_TOOLS: Record<string, string> = {
  'stripe.chargeCustomer': 'PAYMENTS',
  'shell.execute': 'EXECUTE_CODE',
}

/**
 * Map an MCP tool name to an AgentOS capability ID.
 */
export function mcpToolToCapability(mcpToolName: string): string | null {
  return MCP_TO_CAPABILITY[mcpToolName] ?? null
}

/**
 * Map an AgentOS capability ID to an MCP tool name.
 */
export function capabilityToMCPTool(capabilityId: string): string | null {
  return CAPABILITY_TO_MCP[capabilityId] ?? null
}

/**
 * Convert an MCP tool manifest entry into a partial Capability object.
 * The resulting Capability still needs inputSchema/outputSchema populated.
 */
export function mcpToolToCapabilityPartial(
  tool: { name: string; description?: string; inputSchema?: Record<string, unknown> }
): Partial<Capability> & { mcpToolName: string } {
  const capabilityId = mcpToolToCapability(tool.name)
  return {
    mcpToolName: tool.name,
    id: capabilityId ?? `mcp:${tool.name}`,
    description: tool.description ?? `MCP tool: ${tool.name}`,
    tools: [tool.name],
    inputSchema: (tool.inputSchema as any) ?? { type: 'object', properties: {} },
  }
}

/**
 * Check if a tool requires a dangerous capability grant.
 * Returns the required capability string if dangerous, null otherwise.
 */
export function getRequiredCapability(toolName: string): string | null {
  return DANGEROUS_TOOLS[toolName] ?? null
}

/**
 * Given a list of granted capabilities (e.g. from ToolPermissions),
 * return whether a specific MCP tool can be invoked.
 */
export function canInvokeTool(
  toolName: string,
  grantedCapabilities: Set<string>
): boolean {
  const required = getRequiredCapability(toolName)
  if (required === null) return true
  return grantedCapabilities.has(required)
}
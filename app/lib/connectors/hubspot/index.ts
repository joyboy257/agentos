/**
 * HubSpot Connector — registers hubspot.* tools with the capability registry.
 */

import { registry } from '@/lib/registry/capability-registry'
import { hubspotReadTools } from './tools/read'
import { hubspotWriteTools } from './tools/write'

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerHubSpotCapabilities(): void {
  for (const tool of hubspotReadTools) {
    registry.register({
      id: tool.id,
      description: tool.description,
      triggers: tool.triggers,
      tools: [tool.id],
      inputSchema: tool.inputSchema as any,
      outputSchema: tool.outputSchema as any,
      approvalConfig: {
        approverType: tool.permissionLevel === 'needs_approval' ? 'user' : 'none',
        timeoutSeconds: 300,
        fallback: 'abort',
      },
      agentRole: tool.id.replace(/[^a-z_]/g, '_'),
    })
  }

  for (const tool of hubspotWriteTools) {
    registry.register({
      id: tool.id,
      description: tool.description,
      triggers: tool.triggers,
      tools: [tool.id],
      inputSchema: tool.inputSchema as any,
      outputSchema: tool.outputSchema as any,
      approvalConfig: {
        approverType: 'user',
        timeoutSeconds: 300,
        fallback: 'abort',
      },
      agentRole: tool.id.replace(/[^a-z_]/g, '_'),
    })
  }
}

// Auto-register on import
registerHubSpotCapabilities()

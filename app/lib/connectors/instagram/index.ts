/**
 * Instagram Connector — registers instagram.* tools with the capability registry.
 * Follows the same pattern as lib/connectors/google-calendar/index.ts
 */

import { registry } from '@/lib/registry/capability-registry'
import { instagramReadTools } from '@/lib/integrations/instagram/tools/read'
import { instagramWriteTools } from '@/lib/integrations/instagram/tools/write'

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerInstagramCapabilities(): void {
  for (const tool of instagramReadTools) {
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

  for (const tool of instagramWriteTools) {
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
registerInstagramCapabilities()

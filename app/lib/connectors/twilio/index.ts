/**
 * Twilio connector — registers twilio.* tools with the capability registry.
 */

import { registry } from '@/lib/registry/capability-registry'
import { twilioWriteTools } from './tools/write'

export function registerTwilioCapabilities(): void {
  for (const tool of twilioWriteTools) {
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
registerTwilioCapabilities()
/**
 * QuickBooks connector — registers quickbooks.* tools with the capability registry.
 */

import { registry } from '@/lib/registry/capability-registry'
import { quickbooksReadTools } from './tools/read'
import { quickbooksWriteTools } from './tools/write'

export function registerQuickBooksCapabilities(): void {
  for (const tool of quickbooksReadTools) {
    registry.register({
      id: tool.id,
      description: tool.description,
      triggers: tool.triggers,
      tools: [tool.id],
      inputSchema: tool.inputSchema as any,
      outputSchema: tool.outputSchema as any,
      approvalConfig: {
        approverType: 'none',
        timeoutSeconds: 300,
        fallback: 'abort',
      },
      agentRole: tool.id.replace(/[^a-z_]/g, '_'),
    })
  }

  for (const tool of quickbooksWriteTools) {
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
registerQuickBooksCapabilities()
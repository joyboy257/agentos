import { registry } from '@/lib/registry/capability-registry'
import { driveTools } from './tools'

export function registerDriveCapabilities(): void {
  for (const tool of driveTools) {
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
}

// Auto-register on import
registerDriveCapabilities()

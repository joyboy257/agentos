import { z } from 'zod';
import type {
  Archetype,
  Capability,
  PermissionLevel,
  ToolDefinition,
  ToolContext,
  ToolResult,
} from './types';

export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();
  private toolDefs: Map<string, ToolDefinition> = new Map();

  registerCapability(capability: Capability, toolDefs: ToolDefinition[]): void {
    this.capabilities.set(capability.id, capability);
    for (const toolDef of toolDefs) {
      this.toolDefs.set(toolDef.name, toolDef);
    }
  }

  getCapability(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  getToolDef(name: string): ToolDefinition | undefined {
    return this.toolDefs.get(name);
  }

  getCapabilitiesByArchetype(archetype: Archetype): Capability[] {
    return Array.from(this.capabilities.values()).filter(
      (cap) => cap.archetype === archetype
    );
  }

  matchByTrigger(phrase: string): Capability[] {
    const normalized = phrase.toLowerCase();
    return Array.from(this.capabilities.values()).filter((cap) =>
      cap.triggerPhrases.some((trigger) => {
        // Exact match
        if (normalized.includes(trigger)) return true;
        // Fuzzy match: all words in trigger must appear in phrase
        const triggerWords = trigger.split(/\s+/);
        return triggerWords.every((word) => normalized.includes(word));
      })
    );
  }
}

// Tool definition stubs (actual implementations wired in Phase 1)
function makeHubspotToolDef(
  name: string,
  isConcurrencySafe: boolean,
  isDestructive: boolean,
  permissionLevel: PermissionLevel
): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    isConcurrencySafe,
    isDestructive,
    permissionLevel,
    execute: async (args: unknown, _context: ToolContext): Promise<ToolResult> => {
      return { success: true, data: {} };
    },
  };
}

function makeWebSearchToolDef(): ToolDefinition {
  return {
    name: 'web.search',
    description: 'Search the web',
    isConcurrencySafe: true,
    isDestructive: false,
    permissionLevel: 'safe',
    execute: async (args: unknown, _context: ToolContext): Promise<ToolResult> => {
      return { success: true, data: {} };
    },
  };
}

function makeLlmToolDef(
  name: string,
  isConcurrencySafe: boolean,
  permissionLevel: PermissionLevel
): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    isConcurrencySafe,
    isDestructive: false,
    permissionLevel,
    execute: async (args: unknown, _context: ToolContext): Promise<ToolResult> => {
      return { success: true, data: {} };
    },
  };
}

// Singleton instance
export const capabilityRegistry = new CapabilityRegistry();

// Import real HubSpot connector — auto-registers with @/lib/registry/capability-registry
// Import must come after singleton is created so that auto-registration works
import '@/lib/connectors/hubspot'

// HubSpot tools are auto-registered via @/lib/connectors/hubspot

// Import Instagram connector — auto-registers instagram.* tools
import '@/lib/connectors/instagram'

// web.search (ingest)
capabilityRegistry.registerCapability(
  {
    id: 'web.search',
    name: 'Web Search',
    description: 'Search the web for information',
    archetype: 'ingest',
    triggerPhrases: ['search web', 'google', 'web search', 'look up', 'research'],
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    tools: ['web.search'],
    permissionLevel: 'safe',
  },
  [makeWebSearchToolDef()]
);

// llm.reason (process)
capabilityRegistry.registerCapability(
  {
    id: 'llm.reason',
    name: 'LLM Reason',
    description: 'Use LLM to reason and analyze',
    archetype: 'process',
    triggerPhrases: ['reason', 'think', 'analyze', 'decide', 'classify'],
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    tools: ['llm'],
    permissionLevel: 'safe',
  },
  [makeLlmToolDef('llm', false, 'safe')]
);

// distill.summarize (distill)
capabilityRegistry.registerCapability(
  {
    id: 'distill.summarize',
    name: 'Summarize',
    description: 'Summarize content into a digest',
    archetype: 'distill',
    triggerPhrases: ['summarize', 'report', 'digest', 'wrap up'],
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    tools: ['llm'],
    permissionLevel: 'safe',
  },
  [makeLlmToolDef('llm', false, 'safe')]
);

// distill.notify (distill)
capabilityRegistry.registerCapability(
  {
    id: 'distill.notify',
    name: 'Notify',
    description: 'Send a notification to the user',
    archetype: 'distill',
    triggerPhrases: ['notify', 'alert', 'tell me', 'send me', 'report to'],
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    tools: ['llm'],
    permissionLevel: 'safe',
  },
  [makeLlmToolDef('llm', false, 'safe')]
);
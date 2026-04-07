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

// ---------------------------------------------------------------------------
// HubSpot Tool Registrations (delegates to real connector at @/lib/registry)
// ---------------------------------------------------------------------------

const HUBSPOT_SCOPES = ['crm.objects.contacts.read', 'crm.objects.deals.read']

function makeHubspotContactToolDef(): ToolDefinition {
  return {
    name: 'hubspot.contacts.read',
    description: 'Read contacts from HubSpot CRM — lists all contacts with their properties (name, email, phone, company).',
    isConcurrencySafe: true,
    isDestructive: false,
    permissionLevel: 'safe',
    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      // Delegate to the real HubSpot connector registered at @/lib/registry/capability-registry
      const { getHubSpotAccessToken, getContacts } = await import('@/lib/connectors/hubspot/client')
      const token = context.userId ? await getHubSpotAccessToken(context.userId) : null
      if (!token) {
        return { success: false, data: null, error: 'HubSpot not connected. Please connect HubSpot in settings.' }
      }
      try {
        const result = await getContacts(token, (args as Record<string, unknown>)?.limit as number ?? 100)
        return {
          success: true,
          data: {
            contacts: result.contacts.map((c) => ({
              id: c.id,
              firstname: c.properties.firstname,
              lastname: c.properties.lastname,
              email: c.properties.email,
              phone: c.properties.phone,
              company: c.properties.company,
              createdate: c.properties.createdate,
            })),
            hasMore: result.hasMore,
          },
        }
      } catch (err: any) {
        return { success: false, data: null, error: err.message }
      }
    },
  }
}

function makeHubspotDealToolDef(): ToolDefinition {
  return {
    name: 'hubspot.deals.read',
    description: 'Read deals from HubSpot CRM — lists all deals with their properties (name, amount, stage, close date).',
    isConcurrencySafe: true,
    isDestructive: false,
    permissionLevel: 'safe',
    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const { getHubSpotAccessToken, getDeals } = await import('@/lib/connectors/hubspot/client')
      const token = context.userId ? await getHubSpotAccessToken(context.userId) : null
      if (!token) {
        return { success: false, data: null, error: 'HubSpot not connected. Please connect HubSpot in settings.' }
      }
      try {
        const result = await getDeals(token, (args as Record<string, unknown>)?.limit as number ?? 100)
        return {
          success: true,
          data: {
            deals: result.deals.map((d) => ({
              id: d.id,
              dealname: d.properties.dealname,
              amount: d.properties.amount,
              dealstage: d.properties.dealstage,
              closedate: d.properties.closedate,
              createdate: d.properties.createdate,
            })),
            hasMore: result.hasMore,
          },
        }
      } catch (err: any) {
        return { success: false, data: null, error: err.message }
      }
    },
  }
}

function makeHubspotLeadToolDef(): ToolDefinition {
  return {
    name: 'hubspot.leads.read',
    description: 'Read leads from HubSpot CRM — lists contacts in the lead lifecycle stage (early-stage contacts for outreach).',
    isConcurrencySafe: true,
    isDestructive: false,
    permissionLevel: 'safe',
    execute: async (args: unknown, context: ToolContext): Promise<ToolResult> => {
      const { getHubSpotAccessToken, getLeads } = await import('@/lib/connectors/hubspot/client')
      const token = context.userId ? await getHubSpotAccessToken(context.userId) : null
      if (!token) {
        return { success: false, data: null, error: 'HubSpot not connected. Please connect HubSpot in settings.' }
      }
      try {
        const result = await getLeads(token, (args as Record<string, unknown>)?.limit as number ?? 100)
        return {
          success: true,
          data: {
            leads: result.leads.map((l) => ({
              id: l.id,
              firstname: l.properties.firstname,
              lastname: l.properties.lastname,
              email: l.properties.email,
              phone: l.properties.phone,
              company: l.properties.company,
              lifecyclestage: l.properties.lifecyclestage,
              createdate: l.properties.createdate,
            })),
            hasMore: result.hasMore,
          },
        }
      } catch (err: any) {
        return { success: false, data: null, error: err.message }
      }
    },
  }
}

// hubspot (ingest) — contacts + leads
capabilityRegistry.registerCapability(
  {
    id: 'hubspot',
    name: 'HubSpot CRM',
    description: 'Read contacts, deals, and leads from HubSpot CRM',
    archetype: 'ingest',
    triggerPhrases: [
      'get hubspot contacts',
      'read hubspot contacts',
      'list hubspot contacts',
      'hubspot contacts',
      'get hubspot deals',
      'hubspot deals',
      'get hubspot leads',
      'hubspot leads',
      'get leads from hubspot',
      'read crm',
      'pull crm',
      'fetch hubspot',
      'get crm data',
    ],
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    tools: ['hubspot.contacts.read', 'hubspot.deals.read', 'hubspot.leads.read'],
    permissionLevel: 'safe',
  },
  [
    makeHubspotContactToolDef(),
    makeHubspotDealToolDef(),
    makeHubspotLeadToolDef(),
  ]
);

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
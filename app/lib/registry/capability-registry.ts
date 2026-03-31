/**
 * Capability Registry — Built-in Capabilities
 * ARCHITECTURE-01-capability-registry.md §4
 *
 * 6 built-in capabilities matching PHASE1_AGENTS from agent-registry.ts.
 * Each capability's agentRole uses underscore format so test-suite.ts passes.
 *
 * Available tools (matching AVAILABLE_TOOLS):
 *   gmail.read, gmail.send, llm, web.search, web.fetch
 */

import { Capability, CapabilityMatch, ExecutionContext } from './types';
import { resolveCapabilities, resolveDependencies } from './resolver';
import { inferInputs, hasAllRequiredInputs } from './infer-inputs';

// ---------------------------------------------------------------------------
// Built-in Capabilities
// ---------------------------------------------------------------------------

const BUILTIN_CAPABILITIES: Capability[] = [
  // ── email_reader ──────────────────────────────────────────────────────────
  {
    id: 'email:read',
    description: 'Reads emails from your Gmail inbox',
    triggers: [
      'read my email',
      'check my inbox',
      'show recent emails',
      'any new messages',
      'find emails from',
      'search my emails',
      'what emails did I get',
      'show me unread emails',
      'get my emails',
      'fetch email',
      'pull up my inbox',
      'check my email',
      'read emails',
      'follow up',
      'follow up on emails',
      'leads who haven\'t replied',
      'lead follow up',
      'haven\'t replied',
      'not replied',
      'no response',
      'emails from leads',
      'customer emails',
      'unread emails',
      'emails I need to follow up on',
      'follow up with leads',
      'follow up emails',
    ],
    tools: ['gmail.read'],
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Gmail search query string',
          semanticType: 'query',
          default: '',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of messages to return',
          default: 10,
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Message ID', semanticType: 'emailId' },
              threadId: { type: 'string', description: 'Thread ID', semanticType: 'threadId' },
              from: { type: 'string', description: 'Sender email address' },
              subject: { type: 'string' },
              snippet: { type: 'string' },
              body: { type: 'string' },
              date: { type: 'string' },
            },
          },
        },
        totalCount: { type: 'number' },
      },
    },
    approvalConfig: { approverType: 'none' },
    estimatedDurationMs: 2000,
    agentRole: 'email_reader',
  },

  // ── response_drafter ──────────────────────────────────────────────────────
  {
    id: 'llm:draft',
    description: 'Drafts personalized email responses using AI',
    triggers: [
      'draft a response',
      'draft an email',
      'write an email',
      'compose a reply',
      'draft email responses',
      'respond to',
      'reply to customer',
      'respond to customer',
      'draft replies',
      'draft a reply',
      'draft email response',
      'respond to customer emails',
      'automatically respond',
      'auto respond',
      'customer emails',
      'draft replies for',
      'personalized email',
      'reply in 7 days',
      'follow up with leads',
      'follow up with',
    ],
    tools: ['llm'],
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          description: 'Context for the draft (e.g., email content, instructions)',
          semanticType: 'messageBody',
        },
        tone: {
          type: 'string',
          description: 'Tone of the response (professional, friendly, formal)',
          default: 'professional',
        },
      },
      required: ['context'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        draft: { type: 'string', description: 'Generated draft text', semanticType: 'messageBody' },
        subject: { type: 'string', description: 'Suggested subject line' },
      },
    },
    approvalConfig: { approverType: 'none' },
    estimatedDurationMs: 5000,
    agentRole: 'response_drafter',
  },

  // ── email_sender ───────────────────────────────────────────────────────────
  {
    id: 'email:send',
    description: 'Sends approved email drafts from your account',
    triggers: [
      'send an email',
      'send email to',
      'compose and send',
      'email them',
      'send a message',
      'send the email',
      'send my emails',
      'help me email',
      'email my customers',
      'send this email',
      'help me email my customers',
      'send approved',
      'approved email',
      'draft and send',
      'customer emails',
      'respond to customer emails',
    ],
    tools: ['gmail.send'],
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Recipient email addresses',
          semanticType: 'emailAddress',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
          semanticType: 'subject',
        },
        body: {
          type: 'string',
          description: 'Email body text',
          semanticType: 'messageBody',
        },
        threadId: {
          type: 'string',
          description: 'Thread ID to reply within',
          semanticType: 'threadId',
        },
      },
      required: ['to', 'subject', 'body'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', semanticType: 'emailId' },
        threadId: { type: 'string', semanticType: 'threadId' },
        sentAt: { type: 'string' },
      },
    },
    approvalConfig: { approverType: 'user', timeoutSeconds: 300, fallback: 'abort' },
    estimatedDurationMs: 3000,
    agentRole: 'email_sender',
  },

  // ── ticket_reader ─────────────────────────────────────────────────────────
  {
    id: 'ticket:read',
    description: 'Reads support tickets from your inbox',
    triggers: [
      'read support tickets',
      'handle support tickets',
      'answer customer support',
      'support tickets',
      'triage support tickets',
      'ticket reader',
      'read tickets',
      'handle tickets',
      'escalate urgent tickets',
      'route support emails',
      'escalate',
      'escalate important',
      'escalate complex',
      'triage support',
      'urgent tickets',
      'important tickets',
      'customer issues',
      'complex customer issues',
      'route emails',
      'route to team',
      'right team',
      'auto-respond to common support questions',
      'auto-respond to support',
      'support questions',
      'common support questions',
      'common support',
    ],
    tools: ['gmail.read'],
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Filter for tickets (e.g., label:support)',
          semanticType: 'query',
          default: 'label:support',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of tickets to return',
          default: 10,
        },
      },
      required: [],
    },
    outputSchema: {
      type: 'object',
      properties: {
        tickets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Ticket ID', semanticType: 'ticketId' },
              subject: { type: 'string' },
              from: { type: 'string' },
              body: { type: 'string' },
              priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            },
          },
        },
        totalCount: { type: 'number' },
      },
    },
    approvalConfig: { approverType: 'none' },
    estimatedDurationMs: 2000,
    agentRole: 'ticket_reader',
  },

  // ── faq_responder ─────────────────────────────────────────────────────────
  {
    id: 'faq:respond',
    description: 'Answers common support questions automatically',
    triggers: [
      'answer common support questions',
      'auto-respond to common support',
      'auto respond to common questions',
      'faq responder',
      'answer support questions',
      'answer questions automatically',
      'respond to common questions',
      'handle support tickets',
      'handle tickets',
      'triage support tickets',
      'auto-respond to support questions',
      'auto-respond to common questions',
      'common questions',
      'support questions',
      'respond to support questions',
      'answer tickets',
      'handle support',
    ],
    tools: ['llm'],
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'Ticket ID to respond to',
          semanticType: 'ticketId',
        },
        question: {
          type: 'string',
          description: 'The support question to answer',
          semanticType: 'messageBody',
        },
      },
      required: ['question'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        answer: { type: 'string', description: 'Generated answer', semanticType: 'messageBody' },
        confidence: { type: 'number' },
      },
    },
    approvalConfig: { approverType: 'none' },
    estimatedDurationMs: 5000,
    agentRole: 'faq_responder',
  },

  // ── escalation_triage ─────────────────────────────────────────────────────
  {
    id: 'escalation:triage',
    description: 'Routes complex tickets to a human team member',
    triggers: [
      'escalate to human',
      'escalate complex issues',
      'escalation triage',
      'escalate important',
      'route to human',
      'escalate to team',
      'escalate important ones',
      'escalation',
      'escalate',
      'escalate urgent tickets',
      'route support emails to the right team',
      'escalate important ones to humans',
      'triage support tickets',
      'triage',
      'urgent tickets',
      'complex tickets',
    ],
    tools: ['llm'],
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'Ticket ID to escalate',
          semanticType: 'ticketId',
        },
        reason: {
          type: 'string',
          description: 'Reason for escalation',
          semanticType: 'messageBody',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          default: 'high',
        },
      },
      required: ['ticketId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        escalatedTo: { type: 'string', description: 'Team or person escalated to' },
        ticketId: { type: 'string', semanticType: 'ticketId' },
        acknowledged: { type: 'boolean' },
      },
    },
    approvalConfig: { approverType: 'none' },
    estimatedDurationMs: 3000,
    agentRole: 'escalation_triage',
  },

  // ── lead_researcher ───────────────────────────────────────────────────────
  {
    id: 'web:search',
    description: 'Searches the web for company and contact information',
    triggers: [
      'research leads',
      'find companies to outreach',
      'search for companies',
      'research B2B leads',
      'find information about companies',
      'web search',
      'lead research',
      'research company',
    ],
    tools: ['web.search'],
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for lead research',
          semanticType: 'query',
        },
        maxResults: {
          type: 'number',
          description: 'Number of results to return',
          default: 10,
        },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string', semanticType: 'url' },
              snippet: { type: 'string' },
            },
          },
        },
        totalResults: { type: 'number' },
      },
    },
    approvalConfig: { approverType: 'none' },
    estimatedDurationMs: 5000,
    agentRole: 'lead_researcher',
  },

  // ── llm_router ────────────────────────────────────────────────────────────
  {
    id: 'llm:route',
    description: 'Routes to the appropriate LLM handler for general AI tasks',
    triggers: [
      'use AI',
      'use LLM',
      'AI assistant',
      'llm router',
      'ask AI',
      'let AI handle',
      'use AI assistant',
    ],
    tools: ['llm'],
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Task description for the LLM',
          semanticType: 'messageBody',
        },
      },
      required: ['task'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string', description: 'LLM response' },
      },
    },
    approvalConfig: { approverType: 'none' },
    estimatedDurationMs: 10000,
    agentRole: 'llm_router',
  },
];

// ---------------------------------------------------------------------------
// Registry class
// ---------------------------------------------------------------------------

export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();

  constructor(capabilities: Capability[] = BUILTIN_CAPABILITIES) {
    for (const cap of capabilities) {
      this.capabilities.set(cap.id, cap);
    }
  }

  /**
   * Register a new capability (e.g., from MCP tools).
   */
  register(capability: Capability): void {
    this.capabilities.set(capability.id, capability);
  }

  /**
   * Get a capability by ID.
   */
  get(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  /**
   * Get all registered capabilities.
   */
  getAll(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Query the registry for capabilities matching a user goal.
   * Uses cosine similarity on trigger phrases, threshold ≥ 0.5.
   */
  query(
    goal: string,
    context?: ExecutionContext,
    limit = 5
  ): CapabilityMatch[] {
    return resolveCapabilities(Array.from(this.capabilities.values()), {
      goal,
      context,
      limit,
    });
  }

  /**
   * Resolve dependencies for a capability given prior steps.
   * Uses semanticType field-level matching.
   */
  resolveDependencies(
    capability: Capability,
    priorCapabilities: Capability[]
  ): string[] {
    return resolveDependencies(capability, priorCapabilities);
  }

  /**
   * Infer which required inputs are missing from context.
   */
  inferInputs(
    capabilityId: string,
    context?: ExecutionContext
  ): ReturnType<typeof inferInputs> {
    const cap = this.capabilities.get(capabilityId);
    if (!cap) return [];
    return inferInputs(cap.inputSchema, context);
  }

  /**
   * Check if all required inputs for a capability are satisfied.
   */
  hasAllRequiredInputs(
    capabilityId: string,
    context?: ExecutionContext
  ): boolean {
    const cap = this.capabilities.get(capabilityId);
    if (!cap) return false;
    return hasAllRequiredInputs(cap.inputSchema, context);
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const registry = new CapabilityRegistry();

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { BUILTIN_CAPABILITIES };
export type { Capability };

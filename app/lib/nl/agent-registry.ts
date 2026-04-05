import { AgentRole } from './types'

export const PHASE1_AGENTS = {
  response_drafter: {
    role: 'response_drafter' as AgentRole,
    name: 'Response Drafter',
    description: 'Drafts personalized responses using AI',
    tools: ['llm'],
    color: '#f59e0b',
  },
  faq_responder: {
    role: 'faq_responder' as AgentRole,
    name: 'FAQ Responder',
    description: 'Answers common support questions automatically',
    tools: ['llm'],
    color: '#f59e0b',
  },
  escalation_triage: {
    role: 'escalation_triage' as AgentRole,
    name: 'Escalation Triage',
    description: 'Routes complex tickets to a human team member',
    tools: ['llm'],
    color: '#a78bfa',
  },
  lead_researcher: {
    role: 'lead_researcher' as AgentRole,
    name: 'Lead Researcher',
    description: 'Searches the web for company and contact information',
    tools: ['web.search'],
    color: '#22c55e',
  },
  llm: {
    role: 'llm' as AgentRole,
    name: 'AI Assistant',
    description: 'Generates text using AI',
    tools: ['llm'],
    color: '#a78bfa',
  },
} as const

export const AVAILABLE_TOOLS = ['llm', 'web.search', 'web.fetch'] as const
export type Phase1Tool = typeof AVAILABLE_TOOLS[number]

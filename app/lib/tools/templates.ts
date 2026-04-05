/**
 * Agent Templates — Phase 1 MVP
 *
 * The starting point for hiring an AI employee.
 * These are the only templates shipped in MVP.
 */

export interface AgentTemplate {
  id: string
  name: string
  description: string
  role: string
  color: string
  heartbeat_schedule?: string
}

const TEMPLATES: AgentTemplate[] = [
  {
    id: 'email-handler',
    name: 'Email Handler',
    description: 'Reads, drafts, and sends email replies on your behalf',
    role: 'email_agent',
    color: '#3b82f6',
    heartbeat_schedule: '*/15 * * * *', // every 15 minutes
  },
  {
    id: 'lead-researcher',
    name: 'Lead Researcher',
    description: 'Finds and enriches potential customers from inbound signals',
    role: 'research_agent',
    color: '#10b981',
  },
  {
    id: 'support-agent',
    name: 'Support Agent',
    description: 'Answers common questions and routes complex issues to you',
    role: 'support_agent',
    color: '#8b5cf6',
    heartbeat_schedule: '*/30 * * * *', // every 30 minutes
  },
]

export function listTemplates(): AgentTemplate[] {
  return TEMPLATES
}

export function getTemplate(id: string): AgentTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

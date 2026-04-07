/**
 * Wire artifact schemas — structured outputs passed between workers.
 * Based on docs/plans/2026-04-07-009-feat-agentos-multi-agent-orchestration-plan.md
 */

export interface EmailDraftArtifact {
  type: 'email_draft'
  subject: string
  body: string
  recipients: string[]
  thread_id?: string
  provenance: {
    session_id: string
    step_count: number
    tools_used: string[]
  }
}

export interface LeadProfileArtifact {
  type: 'lead_profile'
  company: string
  value?: string
  contact?: { name: string; email: string; title?: string }
  summary: string
  source: string
  provenance: {
    session_id: string
    step_count: number
    tools_used: string[]
  }
}

export interface ResearchSummaryArtifact {
  type: 'research_summary'
  query: string
  findings: string[]
  sources: string[]
  provenance: {
    session_id: string
    step_count: number
    tools_used: string[]
  }
}

export interface EscalationContextArtifact {
  type: 'escalation_context'
  agentName: string
  reason: string
  proposedAction: string
  reasoningTrace: string
  blastRadius?: string
  provenance: {
    session_id: string
    step_count: number
    tools_used: string[]
  }
}

export type Artifact =
  | EmailDraftArtifact
  | LeadProfileArtifact
  | ResearchSummaryArtifact
  | EscalationContextArtifact
  | Record<string, unknown>

export function isArtifact(obj: unknown): obj is Artifact {
  return typeof obj === 'object' && obj !== null && 'type' in obj
}

export function formatArtifactForPrompt(artifact: Artifact): string {
  // Format artifact as readable prompt section for downstream agent
  if (artifact.type === 'email_draft') {
    const a = artifact as EmailDraftArtifact
    return `Email draft (subject: "${a.subject}"):\nTo: ${a.recipients.join(', ')}\n\n${a.body}`
  }
  if (artifact.type === 'lead_profile') {
    const a = artifact as LeadProfileArtifact
    return `Lead profile: ${a.company}${a.value ? ` (${a.value})` : ''}\n${a.summary}${a.contact ? `\nContact: ${a.contact.name} <${a.contact.email}>` : ''}`
  }
  if (artifact.type === 'research_summary') {
    const a = artifact as ResearchSummaryArtifact
    return `Research summary for: ${a.query}\n\n${a.findings.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')}\n\nSources: ${a.sources.join(', ')}`
  }
  if (artifact.type === 'escalation_context') {
    const a = artifact as EscalationContextArtifact
    return `[Escalation from ${a.agentName}]\nReason: ${a.reason}\nProposed action: ${a.proposedAction}\n\nReasoning: ${a.reasoningTrace}`
  }
  return JSON.stringify(artifact, null, 2)
}

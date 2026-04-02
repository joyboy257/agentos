// Escalation suggestion types — Phase A

export type SuggestionType =
  | 'schedule_recurring'
  | 'follow_on_task'
  | 'connector_gap'
  | 'approval_bump'
  | 'budget_increase'

export interface ProposalAction {
  type: 'schedule' | 'add_node' | 'connect_app' | 'adjust_threshold' | 'adjust_budget'
  payload: Record<string, unknown>
}

export interface TriggerResult {
  type: SuggestionType
  confidence: number
  triggerDescription: string
  triggerEvidence: string[]
  proposalHeadline: string
  proposalDetail: string
  proposalAction: Record<string, unknown>
}

export interface EscalationSuggestion {
  id: string
  agent_id: string
  run_id: string
  type: SuggestionType
  confidence: number
  trigger_description: string
  trigger_evidence: string[]
  proposal_headline: string
  proposal_detail: string
  proposal_action: ProposalAction
  status: 'pending' | 'accepted' | 'dismissed' | 'expired'
  created_at: string
  resolved_at?: string
  resolved_by?: string
}

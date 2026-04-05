/**
 * TRANSCRIPT_CLASSIFIER — LLM-based permission classifier.
 *
 * Takes a tool call + user history, outputs a structured ClassifierDecision.
 * Uses the existing llmTool (GPT-4o) from the runtime tools.
 */

import { llmTool } from '../runtime/tools/llm'
import {
  buildClassifierSystemPrompt,
  buildClassifierUserPrompt,
  parseClassifierOutput,
  type ClassifierInput,
  type ClassifierDecision,
} from './classifier-prompt'
import { getRecentApprovalHistory } from './approval-history'

// Threshold config from env
const AUTO_APPROVE_THRESHOLD = parseFloat(process.env.AUTO_APPROVE_THRESHOLD ?? '0.90')
const NOTIFY_THRESHOLD = parseFloat(process.env.NOTIFY_THRESHOLD ?? '0.70')

export interface ClassifyToolCallInput {
  toolName: string
  args: Record<string, unknown>
  agentRole: string
  userId: string
}

/**
 * Classifies a tool call using the LLM.
 * Returns a ClassifierDecision with decision, reasoning, and confidence.
 */
export async function classifyToolCall(input: ClassifyToolCallInput): Promise<ClassifierDecision> {
  const history = await getRecentApprovalHistory(input.userId)

  const classifierInput: ClassifierInput = {
    toolName: input.toolName,
    args: input.args,
    agentRole: input.agentRole,
    userId: input.userId,
    recentApprovalHistory: history,
  }

  const systemPrompt = buildClassifierSystemPrompt()
  const userPrompt = buildClassifierUserPrompt(classifierInput)

  const result = await llmTool(userPrompt, systemPrompt)

  const parsed = parseClassifierOutput(result.text)
  if (!parsed) {
    // Fall back to escalate on parse failure
    return {
      decision: 'escalate',
      reasoning: 'Classifier returned unparseable output — defaulting to escalate for safety.',
      confidence: 0,
    }
  }

  return parsed
}

/**
 * Determines whether to auto-approve based on the classifier decision and thresholds.
 */
export function shouldAutoApprove(decision: ClassifierDecision): boolean {
  return decision.decision === 'auto_approve' && decision.confidence >= AUTO_APPROVE_THRESHOLD
}

/**
 * Determines whether to execute and notify based on thresholds.
 */
export function shouldExecuteAndNotify(decision: ClassifierDecision): boolean {
  return (
    (decision.decision === 'execute_and_notify' || decision.decision === 'auto_approve') &&
    decision.confidence >= NOTIFY_THRESHOLD &&
    decision.confidence < AUTO_APPROVE_THRESHOLD
  )
}

/**
 * Determines whether to escalate (require user approval).
 */
export function shouldEscalate(decision: ClassifierDecision): boolean {
  return (
    decision.decision === 'escalate' ||
    decision.confidence < NOTIFY_THRESHOLD
  )
}

export { AUTO_APPROVE_THRESHOLD, NOTIFY_THRESHOLD }
export type { ClassifierDecision } from './classifier-prompt'

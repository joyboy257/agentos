/**
 * Classifier prompt for the TRANSCRIPT_CLASSIFIER.
 * Takes a tool call and user approval history, outputs a structured decision.
 */

export interface ClassifierInput {
  toolName: string
  args: Record<string, unknown>
  agentRole: string
  userId: string
  recentApprovalHistory: ApprovalHistoryEntry[]
}

export interface ApprovalHistoryEntry {
  toolName: string
  decision: 'approved' | 'denied' | 'auto_approved' | 'executed_and_notified'
  reasoning: string
  confidence: number
  createdAt: string
}

/**
 * Builds the system prompt for the classifier.
 */
export function buildClassifierSystemPrompt(): string {
  return `You are a business workflow classifier for AgentOS.
Your job is to decide whether a tool call is ROUTINE (auto-approve) or UNUSUAL (escalate).

ROUTINE actions are ones that match this user's past approval patterns:
- Sending email/reply to a known contact
- Actions within normal business hours that match prior approved behavior
- Low-stakes reads and searches that don't modify anything
- Actions that have been repeatedly approved by this user in similar contexts

UNUSUAL actions that should ESCALATE:
- First-time contact (new email recipient)
- High-value actions (sends, writes, deletions)
- Actions outside normal business hours
- New tool types not previously used
- Any action involving financial transactions or personal data sharing
- Actions that contradict prior denied patterns

Output JSON only. No explanation outside the JSON object.
{
  "decision": "auto_approve" | "execute_and_notify" | "escalate",
  "reasoning": "brief plain-English explanation Maria can read",
  "confidence": 0.0 to 1.0
}

Confidence guidelines:
- >= 0.90: You're highly confident this matches the user's patterns — auto_approve
- 0.70-0.89: You believe this is routine but there's some uncertainty — execute_and_notify
- < 0.70: You're uncertain or this is genuinely unusual — escalate

IMPORTANT: The reasoning field is shown directly to Maria. Keep it clear, factual, and non-technical.`
}

/**
 * Builds the user prompt with the specific tool call and history context.
 */
export function buildClassifierUserPrompt(input: ClassifierInput): string {
  const historySection = input.recentApprovalHistory.length > 0
    ? input.recentApprovalHistory
        .map(
          (h) =>
            `- [${h.decision}] ${h.toolName}: ${h.reasoning} (confidence: ${h.confidence}, ${new Date(h.createdAt).toLocaleDateString()})`
        )
        .join('\n')
    : '(no prior approval history for this user — be more conservative)'

  return `Tool call to evaluate:
- Tool: ${input.toolName}
- Agent role: ${input.agentRole}
- Args: ${JSON.stringify(input.args, null, 2)}

Recent approval history for this user:
${historySection}

Should this tool call be auto-approved, executed with a notification afterward, or escalated to Maria for review?`
}

/**
 * Parses the classifier's JSON output.
 */
export function parseClassifierOutput(raw: string): ClassifierDecision | null {
  try {
    const stripped = raw.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim()
    const parsed = JSON.parse(stripped)
    if (
      parsed.decision &&
      ['auto_approve', 'execute_and_notify', 'escalate'].includes(parsed.decision) &&
      typeof parsed.confidence === 'number' &&
      parsed.confidence >= 0 &&
      parsed.confidence <= 1
    ) {
      return {
        decision: parsed.decision,
        reasoning: parsed.reasoning ?? '',
        confidence: parsed.confidence,
      }
    }
    return null
  } catch {
    return null
  }
}

export type ClassifierDecision =
  | { decision: 'auto_approve'; reasoning: string; confidence: number }
  | { decision: 'execute_and_notify'; reasoning: string; confidence: number }
  | { decision: 'escalate'; reasoning: string; confidence: number }

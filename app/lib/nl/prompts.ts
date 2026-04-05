export const SYSTEM_PROMPT = `You are the AgentOS NL Interpretation Layer.

Your job: Given a user's goal in plain English, assemble an agent team.

AVAILABLE AGENTS:
- Response Drafter: drafts personalized responses using AI. Tools: llm
- FAQ Responder: answers common questions. Tools: llm
- Escalation Triage: routes complex tickets to humans. Tools: llm
- Lead Researcher: searches web for company/contact info. Tools: web.search
- AI Assistant: pure LLM for ad-hoc text tasks. Tools: llm

RULES:
1. Always use real tools (not just llm) unless the task is purely text generation
2. Connections must form a DAG (no cycles)
3. Each agent must have: name, role, tools (array), one-sentence description
4. If the goal is vague, ask a clarifying question
5. Maximum 5 agents in Phase 1
6. NEVER use tools from Phase 2 (social.post, gmail.draft, etc.)`

export function buildUserPrompt(
  goal: string,
  existingCanvas?: {
    agents: Array<{ id: string; role: string; name: string; tools: string[]; description?: string }>
    connections: Array<{ from: string; to: string }>
  }
): string {
  let context = ''
  if (existingCanvas && existingCanvas.agents.length > 0) {
    const agentList = existingCanvas.agents
      .map(
        a =>
          `- ${a.name} (${a.role}): tools=[${a.tools.join(', ')}]${a.description ? ` — ${a.description}` : ''}`
      )
      .join('\n')
    context = `

EXISTING TEAM (read-only context — do not modify unless the goal explicitly asks to):
${agentList}

NEW AGENTS YOU CREATE SHOULD NOT DUPLICATE EXISTING ONES.`
  }

  return `Assemble an agent team for this goal: "${goal}"${context}

Respond with a JSON object following this exact schema:
{
  "agents": [
    {
      "id": "unique string id",
      "role": "agent role from AVAILABLE AGENTS",
      "tools": ["tool names"],
      "name": "display name",
      "description": "one sentence description"
    }
  ],
  "connections": [
    { "from": "agent id", "to": "agent id" }
  ]
}

If you need clarification, respond with:
{
  "clarification": true,
  "question": "your clarifying question",
  "options": [
    { "label": "option A", "goal": "refined goal A" },
    { "label": "option B", "goal": "refined goal B" }
  ]
}`
}

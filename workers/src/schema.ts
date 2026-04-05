/**
 * AgentOS NL Interpretation Worker — Zod Schemas
 *
 * Shared between Worker (validation) and app client (type safety).
 */

import { z } from "zod"

// ---------------------------------------------------------------------------
// Shared schemas (must match app/lib/nl/types.ts)
// ---------------------------------------------------------------------------

export const AgentRoleSchema = z.enum([
  'response_drafter',
  'faq_responder',
  'escalation_triage',
  'lead_researcher',
  'lead_enricher',
  'llm',
  'team_lead',
  'worker',
])

export const AgentSchema = z.object({
  id: z.string(),
  role: AgentRoleSchema,
  tools: z.array(z.string()),
  name: z.string(),
  description: z.string(),
})

export const ConnectionSchema = z.object({
  from: z.string(),
  to: z.string(),
})

export const AgentGraphSchema = z.object({
  agents: z.array(AgentSchema),
  connections: z.array(ConnectionSchema),
})

export const ClarificationOptionSchema = z.object({
  label: z.string(),
  goal: z.string(),
})

export const InterpretationResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('success'),
    graph: AgentGraphSchema,
    explanation: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    type: z.literal('clarification'),
    question: z.string(),
    options: z.array(ClarificationOptionSchema),
    explanation: z.string(),
    confidence: z.literal(0),
  }),
  z.object({
    type: z.literal('error'),
    error: z.string(),
    explanation: z.string(),
    confidence: z.literal(0),
  }),
])

// ---------------------------------------------------------------------------
// Canvas input schemas
// ---------------------------------------------------------------------------

export const CanvasAgentInputSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['team-lead', 'worker']),
  archetype: z.enum(['Ingest', 'Process', 'Distill']).optional(),
  tools: z.array(z.string()),
  description: z.string().optional(),
  position_x: z.number(),
  position_y: z.number(),
})

export const CanvasConnectionInputSchema = z.object({
  id: z.string().optional(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
})

export const InterpretRequestSchema = z.object({
  teamId: z.string(),
  goal: z.string().min(1).max(500),
  existingNodes: z.array(CanvasAgentInputSchema).optional(),
  existingEdges: z.array(CanvasConnectionInputSchema).optional(),
})

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type AgentRole = z.infer<typeof AgentRoleSchema>
export type Agent = z.infer<typeof AgentSchema>
export type Connection = z.infer<typeof ConnectionSchema>
export type AgentGraph = z.infer<typeof AgentGraphSchema>
export type ClarificationOption = z.infer<typeof ClarificationOptionSchema>
export type InterpretationResponse = z.infer<typeof InterpretationResponseSchema>
export type CanvasAgentInput = z.infer<typeof CanvasAgentInputSchema>
export type CanvasConnectionInput = z.infer<typeof CanvasConnectionInputSchema>
export type InterpretRequest = z.infer<typeof InterpretRequestSchema>

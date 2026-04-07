/**
 * StreamingToolExecutor — streams Anthropic LLM and executes tools as they appear.
 *
 * Pattern:
 * 1. Call Anthropic /v1/messages with stream: true
 * 2. Parse SSE events as they arrive
 * 3. When LLM signals end (message_stop), partition tool calls
 * 4. Fire read tools in parallel immediately
 * 5. Hold write tools until reads complete, then fire serially
 * 6. Check permissionLevel — if needs_approval, pause and emit escalation event
 * 7. Inject tool results back as a user message and continue the LLM loop
 * 8. Loop until stop_reason is "end_turn"
 *
 * ## Vercel AI SDK Migration — DEFERRED
 *
 * Migration to `streamText` from the Vercel AI SDK was explored. Key findings:
 * - `@ai-sdk/anthropic` supports Anthropic models natively — SDK transport works
 * - `experimental_onToolCallStart`/`experimental_onToolCallFinish` provide per-tool
 *   callback granularity matching our checkpoint pattern
 * - DEFERRED: `tool()` from `ai` requires strictly typed Zod schemas matching the
 *   TOOLS generic. Our dynamic tool registry (capabilityRegistry) returns tools at
 *   runtime, making it impossible to provide a correct `ToolSet` type to
 *   `streamText<TOOLS>`. Even with `Record<string, Tool>` and `z.any()`, the SDK's
 *   internal `TypedToolCall<TOOLS>` resolves to `never`.
 *
 * Current status: `USE_AI_SDK = false` — raw SSE implementation preserved and working.
 * Re-approach when: tool registry provides compile-time typed tools, OR a simpler
 * transport abstraction is added to the AI SDK, OR `any` casts are accepted.
 *
 * See: `lib/runtime/streaming-tool-executor.sdk.ts` for the SDK exploration code.
 */

import { capabilityRegistry } from '../capability-registry'
import { partitionToolCalls } from './partition-tool-calls'
import { withCircuitBreaker, getCircuitBreakerForTool } from '../middleware/circuit-breaker'
import { withTimeout, DEFAULT_TIMEOUT_MS } from '../middleware/with-timeout'
import { withRetry, DEFAULT_RETRY_CONFIG } from '../middleware/with-retry'
import type { ToolContext, ToolCall } from '../capability-registry/types'
import { webSearchTool } from './tools/web'
import { generateIdempotencyKey } from './idempotency'
import { createCheckpoint } from '../db/queries'
import { getHookRegistry } from '../hooks/hook-registry'
import { classifyToolCall, shouldAutoApprove, shouldExecuteAndNotify } from '../classifier/transcript-classifier'
import type { ClassifierDecision } from '../classifier/classifier-prompt'

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

const USE_AI_SDK = false

// ---------------------------------------------------------------------------
// Anthropic API client — uses fetch to call the streaming messages API
// ---------------------------------------------------------------------------

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

// Estimated cost in ms for an LLM API call (prompt + streaming response)
const ESTIMATED_LLM_CALL_MS = 1000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  name?: string
  input?: Record<string, unknown>
  id?: string
  tool_use_id?: string
}

interface AnthropicTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

interface AnthropicStreamEvent {
  type: string
  index?: number
  content_block?: AnthropicContentBlock
  delta?: { type: string; text?: string; stop_reason?: string }
  message?: { id: string; role: string; content: AnthropicContentBlock[]; model: string; stop_reason?: string }
}

// ---------------------------------------------------------------------------
// Tool execution dispatch — wires real tools via capability registry
// ---------------------------------------------------------------------------

const TOOL_TIMEOUTS: Record<string, number> = {
  'web.search': 15_000,
  'hubspot.contacts.list': 30_000,
  'hubspot.contacts.search': 30_000,
  'hubspot.deals.list': 30_000,
  'hubspot.deals.get': 20_000,
  'hubspot.tickets.list': 30_000,
  'hubspot.company.get': 20_000,
  'hubspot.contacts.create': 20_000,
  'hubspot.contacts.update': 20_000,
  'hubspot.deals.create': 20_000,
  'hubspot.deals.update_stage': 20_000,
  'hubspot.notes.create': 20_000,
  'hubspot.tickets.create': 20_000,
  'slack.channel.post': 15_000,
  'slack.channel.update': 10_000,
  'slack.channels.list': 15_000,
  'slack.messages.recent': 15_000,
  'calendar.events.create': 20_000,
  'calendar.events.update': 20_000,
  'calendar.events.delete': 15_000,
  'calendar.events.list': 15_000,
  'calendar.events.get': 10_000,
  'calendar.availability.get': 15_000,
}

/**
 * Dispatch a tool call to the appropriate implementation.
 * Falls back to the registry's execute fn when available.
 */
async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    // Direct wiring for Phase 1 tools
    if (toolName === 'web.search') {
      const result = await webSearchTool(args.query as string, (args.limit as number) ?? 10)
      return { success: true, data: result }
    }

    // Generic capability registry dispatch
    const toolDef = capabilityRegistry.getToolDef(toolName)
    if (toolDef) {
      const timeoutMs = TOOL_TIMEOUTS[toolName] ?? DEFAULT_TIMEOUT_MS
      const breaker = getCircuitBreakerForTool(toolName)
      const result = await withTimeout(
        toolName,
        withCircuitBreaker(() => withRetry(() => toolDef.execute(args, context), DEFAULT_RETRY_CONFIG), breaker),
        timeoutMs
      )
      return result
    }

    return { success: false, error: `unknown tool: ${toolName}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface ReasoningEvent {
  type: 'status' | 'action' | 'approval_required' | 'done' | 'error' | 'budget_exceeded'
  agentId: string
  status?: string
  message?: string
  tool?: string
  args?: Record<string, unknown>
  result?: unknown
  error?: string
}

// ---------------------------------------------------------------------------
// StreamingExecutorOptions
// ---------------------------------------------------------------------------

export interface StreamingExecutorOptions {
  runId: string
  agentId: string
  userId: string
  orgId: string
  messages: AnthropicMessage[]
  tools: string[]  // capability IDs or tool names
  maxTokens?: number
  model?: string
  systemPrompt?: string  // injected at call time (e.g. memory context)
  budgetMs?: number | null
  elapsedMs?: number
  onEvent?: (event: ReasoningEvent) => void
  onBudgetExceeded?: (elapsedMs: number, budgetMs: number) => void
  signal?: AbortSignal
}

// ---------------------------------------------------------------------------
// SSE event parser
// ---------------------------------------------------------------------------

function parseSSE(line: string): AnthropicStreamEvent | null {
  if (!line.startsWith('data: ')) return null
  const json = line.slice(6)
  if (json === '[DONE]') return null
  try {
    return JSON.parse(json) as AnthropicStreamEvent
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Main streaming executor
// ---------------------------------------------------------------------------

export async function streamingToolExecutor(
  options: StreamingExecutorOptions
): Promise<{ messages: AnthropicMessage[]; stopReason: string; elapsedMs: number }> {
  const {
    runId,
    agentId,
    userId,
    orgId,
    messages,
    tools,
    maxTokens = 4096,
    model = 'claude-sonnet-4-20250514',
    systemPrompt,
    budgetMs,
    elapsedMs: initialElapsedMs = 0,
    onEvent,
    onBudgetExceeded,
    signal,
  } = options

  const context: ToolContext = { runId, agentId, userId, orgId, signal }
  const hooks = getHookRegistry()

  // Track elapsed time for budget enforcement
  let elapsedMs = initialElapsedMs

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set')
  }

  // Build Anthropic tool definitions from registry
  const toolDefs: AnthropicTool[] = tools
    .map((id) => {
      // Try capability ID first, then tool name
      const cap = capabilityRegistry.getCapability(id)
      if (cap) {
        return cap.tools.map((t) => {
          const def = capabilityRegistry.getToolDef(t)
          if (!def) return null
          return {
            name: def.name,
            description: def.description,
            input_schema: {},
          }
        }).filter(Boolean) as AnthropicTool[]
      }
      const def = capabilityRegistry.getToolDef(id)
      if (!def) return null
      return [{
        name: def.name,
        description: def.description,
        input_schema: {},
      }]
    })
    .flat()
    .filter(Boolean) as AnthropicTool[]

  let step = 0
  let inputMessages = [...messages]

  while (true) {
    if (signal?.aborted) {
      return { messages: inputMessages, stopReason: 'aborted', elapsedMs }
    }

    // Budget check before LLM call
    if (budgetMs != null && elapsedMs + ESTIMATED_LLM_CALL_MS > budgetMs) {
      onBudgetExceeded?.(elapsedMs, budgetMs)
      return { messages: inputMessages, stopReason: 'budget_exceeded', elapsedMs }
    }

    // Emit thinking status
    onEvent?.({ type: 'status', agentId, status: 'thinking', message: '' })

    // 1. Call Anthropic streaming via fetch + SSE
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: inputMessages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        stream: true,
      }),
      signal: signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`)
    }

    if (!response.body) {
      throw new Error('Anthropic API returned empty response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    let currentText = ''
    let stopReason = ''
    const pendingToolCalls: Array<{
      name: string
      input: Record<string, unknown>
      id: string
    }> = []

    // 2. Consume the SSE stream — collect tool_use blocks as they arrive
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // Keep incomplete line in buffer

      for (const line of lines) {
        const event = parseSSE(line)
        if (!event) continue

        switch (event.type) {
          case 'content_block_start':
            if (event.content_block?.type === 'tool_use') {
              pendingToolCalls.push({
                name: event.content_block.name ?? '',
                input: event.content_block.input ?? {},
                id: event.content_block.id ?? '',
              })
            }
            break

          case 'content_block_delta':
            if (event.delta?.type === 'text_delta') {
              currentText += event.delta.text ?? ''
              onEvent?.({ type: 'status', agentId, status: 'thinking', message: currentText })
            }
            break

          case 'message_delta':
            stopReason = event.delta?.stop_reason ?? ''
            break

          case 'message_stop':
            // LLM finished — if no tool calls, we're done
            if (pendingToolCalls.length === 0) {
              if (stopReason === 'end_turn' || stopReason === 'completed') {
                onEvent?.({ type: 'done', agentId, message: currentText })
                return { messages: inputMessages, stopReason, elapsedMs }
              }
              return { messages: inputMessages, stopReason, elapsedMs }
            }
            break
        }
      }
    }

    // Account for the LLM API call time
    elapsedMs += ESTIMATED_LLM_CALL_MS

    // 3. Partition collected tool calls into reads vs writes
    const toolCalls: ToolCall[] = pendingToolCalls.map((tc) => ({
      name: tc.name,
      args: tc.input,
      id: tc.id,
    }))

    const { readTools, writeTools } = partitionToolCalls(toolCalls)

    // 4a. Execute read tools in parallel — checkpoint before each
    const readResults = await Promise.all(
      readTools.map(async (tc) => {
        const idempotencyKey = generateIdempotencyKey()

        // Pre-execution checkpoint
        await createCheckpoint({
          run_id: runId,
          step,
          state_before: { agentId, toolName: tc.name, args: tc.args },
          tool_name: tc.name,
          tool_call_id: idempotencyKey,
        })

        onEvent?.({ type: 'action', agentId, tool: tc.name, status: 'running' })
        void hooks.emit('preToolCall', {
          runId,
          agentId,
          timestamp: Date.now(),
          preToolCall: { toolName: tc.name, args: tc.args },
        })

        const result = await dispatchTool(tc.name, tc.args, context)

        // Post-execution checkpoint
        await createCheckpoint({
          run_id: runId,
          step,
          state_after: { agentId, completed: true, toolName: tc.name },
          tool_result: result,
          tool_call_id: idempotencyKey,
        })

        void hooks.emit('postToolCall', {
          runId,
          agentId,
          timestamp: Date.now(),
          toolName: tc.name,
          postToolCall: { toolName: tc.name, result, durationMs: 0 },
        })

        if (result.success) {
          onEvent?.({ type: 'action', agentId, tool: tc.name, status: 'completed', result: result.data })
        } else {
          onEvent?.({ type: 'error', agentId, tool: tc.name, error: result.error })
        }

        step++
        return { tool_call_id: tc.id, ...result }
      })
    )

    // 4b. Execute write tools serially — checkpoint before/after each
    const writeResults = []
    for (const tc of writeTools) {
      const idempotencyKey = generateIdempotencyKey()
      const toolDef = capabilityRegistry.getToolDef(tc.name)

      // Pre-execution checkpoint
      await createCheckpoint({
        run_id: runId,
        step,
        state_before: { agentId, toolName: tc.name, args: tc.args },
        tool_name: tc.name,
        tool_call_id: idempotencyKey,
      })

      // Check permission level — needs_approval tools go through classifier
      const permissionLevel = toolDef?.permissionLevel ?? 'safe'
      if (permissionLevel === 'needs_approval' || permissionLevel === 'admin_only') {
        // Run classifier to decide whether to auto-approve or escalate
        const classifierDecision: ClassifierDecision = await classifyToolCall({
          toolName: tc.name,
          args: tc.args,
          agentRole: 'agent', // TODO: wire through agent.role from agentId lookup
          userId,
        })

        if (shouldAutoApprove(classifierDecision)) {
          // Auto-approve: dispatch immediately and log the decision
          onEvent?.({ type: 'action', agentId, tool: tc.name, status: 'running' })
          void hooks.emit('preToolCall', {
            runId,
            agentId,
            timestamp: Date.now(),
            preToolCall: { toolName: tc.name, args: tc.args },
          })

          const result = await dispatchTool(tc.name, tc.args, context)
          writeResults.push({ tool_call_id: tc.id, ...result })

          // Post-execution checkpoint
          await createCheckpoint({
            run_id: runId,
            step,
            state_after: { agentId, completed: true, toolName: tc.name },
            tool_result: result,
            tool_call_id: idempotencyKey,
          })

          void hooks.emit('postToolCall', {
            runId,
            agentId,
            timestamp: Date.now(),
            toolName: tc.name,
            postToolCall: { toolName: tc.name, result, durationMs: 0 },
          })

          if (result.success) {
            onEvent?.({ type: 'action', agentId, tool: tc.name, status: 'completed', result: result.data })
          } else {
            onEvent?.({ type: 'error', agentId, tool: tc.name, error: result.error })
          }

          step++
          continue
        }

        if (shouldExecuteAndNotify(classifierDecision)) {
          // Execute and notify: dispatch, then send notification to Maria afterward
          onEvent?.({ type: 'action', agentId, tool: tc.name, status: 'running' })
          void hooks.emit('preToolCall', {
            runId,
            agentId,
            timestamp: Date.now(),
            preToolCall: { toolName: tc.name, args: tc.args },
          })

          const result = await dispatchTool(tc.name, tc.args, context)
          writeResults.push({ tool_call_id: tc.id, ...result })

          // Post-execution checkpoint
          await createCheckpoint({
            run_id: runId,
            step,
            state_after: { agentId, completed: true, toolName: tc.name },
            tool_result: result,
            tool_call_id: idempotencyKey,
          })

          void hooks.emit('postToolCall', {
            runId,
            agentId,
            timestamp: Date.now(),
            toolName: tc.name,
            postToolCall: { toolName: tc.name, result, durationMs: 0 },
          })

          if (result.success) {
            onEvent?.({ type: 'action', agentId, tool: tc.name, status: 'completed', result: result.data })
          } else {
            onEvent?.({ type: 'error', agentId, tool: tc.name, error: result.error })
          }

          step++
          continue
        }

        // Escalate: fall through to current behavior
        onEvent?.({
          type: 'approval_required',
          agentId,
          tool: tc.name,
          args: tc.args,
        })
        void hooks.emit('preToolCall', {
          runId,
          agentId,
          timestamp: Date.now(),
          preToolCall: { toolName: tc.name, args: tc.args },
        })
        // Return early — caller should handle escalation flow
        return { messages: inputMessages, stopReason: 'approval_required', elapsedMs }
      }

      onEvent?.({ type: 'action', agentId, tool: tc.name, status: 'running' })
      void hooks.emit('preToolCall', {
        runId,
        agentId,
        timestamp: Date.now(),
        preToolCall: { toolName: tc.name, args: tc.args },
      })

      const result = await dispatchTool(tc.name, tc.args, context)
      writeResults.push({ tool_call_id: tc.id, ...result })

      // Post-execution checkpoint
      await createCheckpoint({
        run_id: runId,
        step,
        state_after: { agentId, completed: true, toolName: tc.name },
        tool_result: result,
        tool_call_id: idempotencyKey,
      })

      void hooks.emit('postToolCall', {
        runId,
        agentId,
        timestamp: Date.now(),
        toolName: tc.name,
        postToolCall: { toolName: tc.name, result, durationMs: 0 },
      })

      if (result.success) {
        onEvent?.({ type: 'action', agentId, tool: tc.name, status: 'completed', result: result.data })
      } else {
        onEvent?.({ type: 'error', agentId, tool: tc.name, error: result.error })
      }

      step++
    }

    // 5. Inject tool results back as a user message and continue the loop
    const toolResultsContent = [
      ...readResults,
      ...writeResults,
    ].map((r) => ({
      type: 'tool_result' as const,
      tool_use_id: r.tool_call_id,
      content: r.success
        ? JSON.stringify(r.data ?? null)
        : `Error: ${r.error ?? 'unknown error'}`,
    }))

    inputMessages.push({
      role: 'user',
      content: toolResultsContent,
    })

    // Loop continues — LLM processes the tool results
  }
}

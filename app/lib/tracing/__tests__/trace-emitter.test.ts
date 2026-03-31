/**
 * Unit tests for trace-emitter.ts
 * Tests Pattern B emit* methods and integration with event buffer and SSE.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTraceEmitter } from '../trace-emitter'
import { eventBufferRegistry } from '../event-buffer'
import { runSecretRegistry } from '../hmac-signing'
import { subscribeToRunChannel, emitToRunChannel } from '../sse-stream'
import { ActionEvent, ClassificationEvent, ObservationEvent, WarningEvent } from '../event-schema'

describe('TraceEmitter', () => {
  const runId = 'test-run-123'
  const agentId = 'test-agent-456'

  beforeEach(() => {
    // Clear registries between tests
    eventBufferRegistry.clear()
    runSecretRegistry.delete(runId)
  })

  describe('emitObservation', () => {
    it('should create an observation event with text', async () => {
      const trace = createTraceEmitter(runId, agentId)
      trace.emitObservation('Checking inbox')
      // Wait for aggregation window to flush
      await new Promise((resolve) => setTimeout(resolve, 600))
      trace.close()

      const buffer = eventBufferRegistry.get(runId)
      expect(buffer).toBeDefined()
      expect(buffer!.size()).toBe(1)

      const events = buffer!.getEvents()
      expect(events[0].type).toBe('observation')
      expect((events[0].content as { text: string }).text).toBe('Checking inbox')
    })

    it('should include sanitized evidence', async () => {
      const trace = createTraceEmitter(runId, agentId)
      trace.emitObservation('Reading email', {
        from: 'john@example.com',
        subject: 'Hello',
        body: 'This is a test',
      })
      await new Promise((resolve) => setTimeout(resolve, 600))
      trace.close()

      const buffer = eventBufferRegistry.get(runId)
      const events = buffer!.getEvents()
      const content = events[0].content as { evidence?: Record<string, unknown> }
      expect(content.evidence).toBeDefined()
      // Email should be redacted
      expect(JSON.stringify(content.evidence)).not.toContain('john@example.com')
      expect(JSON.stringify(content.evidence)).toContain('[EMAIL]')
    })

    it('should sign events with HMAC when signing context is available', async () => {
      runSecretRegistry.create(runId)
      const trace = createTraceEmitter(runId, agentId)
      trace.emitObservation('Test observation')
      await new Promise((resolve) => setTimeout(resolve, 600))
      trace.close()

      const buffer = eventBufferRegistry.get(runId)
      const events = buffer!.getEvents()
      expect(events[0].integrity).toBeDefined()
      expect(events[0].integrity?.mac).toBeDefined()
      expect(events[0].integrity?.tag).toBeDefined()
    })
  })

  describe('emitClassification', () => {
    it('should create a classification event with label and confidence', () => {
      const trace = createTraceEmitter(runId, agentId)
      trace.emitClassification('lead_inquiry', 0.87, [
        { label: 'lead_inquiry', confidence: 0.87 },
        { label: 'support_request', confidence: 0.13 },
      ])

      const buffer = eventBufferRegistry.get(runId)
      const events = buffer!.getEvents()
      expect(events[0].type).toBe('classification')
      const content = events[0].content as { label: string; confidence: number; alternatives?: unknown[] }
      expect(content.label).toBe('lead_inquiry')
      expect(content.confidence).toBe(0.87)
      expect(content.alternatives).toHaveLength(2)
    })
  })

  describe('emitDecision', () => {
    it('should create a decision event with alternatives and chosen', () => {
      const trace = createTraceEmitter(runId, agentId)
      trace.emitDecision(
        [
          { label: 'send_to_sales', reason: 'High-value lead' },
          { label: 'send_to_support', reason: 'Technical question' },
        ],
        'send_to_sales',
        'This is a high-value enterprise lead'
      )

      const buffer = eventBufferRegistry.get(runId)
      const events = buffer!.getEvents()
      expect(events[0].type).toBe('decision')
      const content = events[0].content as { alternatives: unknown[]; chosen: string; reason: string }
      expect(content.alternatives).toHaveLength(2)
      expect(content.chosen).toBe('send_to_sales')
      expect(content.reason).toBe('This is a high-value enterprise lead')
    })
  })

  describe('emitAction', () => {
    it('should create an action event', () => {
      const trace = createTraceEmitter(runId, agentId)
      trace.emitAction('Sending email', { to: 'test@example.com', subject: 'Hello' })

      const buffer = eventBufferRegistry.get(runId)
      const events = buffer!.getEvents()
      expect(events[0].type).toBe('action')
      const content = events[0].content as { action: string; args: Record<string, unknown> }
      expect(content.action).toBe('Sending email')
      expect(content.args).toBeDefined()
    })

    it('should sanitize action args', () => {
      const trace = createTraceEmitter(runId, agentId)
      trace.emitAction('Sending email', { to: 'test@example.com' })

      const buffer = eventBufferRegistry.get(runId)
      const events = buffer!.getEvents()
      const content = events[0].content as { args: Record<string, unknown> }
      expect(JSON.stringify(content.args)).not.toContain('test@example.com')
      expect(JSON.stringify(content.args)).toContain('[EMAIL]')
    })
  })

  describe('emitWarning', () => {
    it('should create a warning event with severity', () => {
      const trace = createTraceEmitter(runId, agentId)
      trace.emitWarning('Rate limit approaching', 'high')

      const buffer = eventBufferRegistry.get(runId)
      const events = buffer!.getEvents()
      expect(events[0].type).toBe('warning')
      const content = events[0].content as { text: string; severity: string }
      expect(content.text).toBe('Rate limit approaching')
      expect(content.severity).toBe('high')
    })

    it('should default severity to medium', () => {
      const trace = createTraceEmitter(runId, agentId)
      trace.emitWarning('Something is off')

      const buffer = eventBufferRegistry.get(runId)
      const events = buffer!.getEvents()
      const content = events[0].content as { severity: string }
      expect(content.severity).toBe('medium')
    })
  })

  describe('close', () => {
    it('should flush pending aggregated events', () => {
      const trace = createTraceEmitter(runId, agentId)
      trace.emitObservation('First')
      trace.close()

      const buffer = eventBufferRegistry.get(runId)
      expect(buffer!.size()).toBeGreaterThan(0)
    })
  })
})

describe('Event aggregation', () => {
  const runId = 'test-aggregation-run'
  const agentId = 'test-agent'

  beforeEach(() => {
    eventBufferRegistry.clear()
    runSecretRegistry.delete(runId)
  })

  it('should aggregate consecutive identical observations', async () => {
    runSecretRegistry.create(runId)
    const trace = createTraceEmitter(runId, agentId)

    // Emit same observation 3 times rapidly
    trace.emitObservation('Checking inbox')
    trace.emitObservation('Checking inbox')
    trace.emitObservation('Checking inbox')

    // Wait for aggregation window (500ms)
    await new Promise((resolve) => setTimeout(resolve, 600))

    trace.close()

    const buffer = eventBufferRegistry.get(runId)
    const events = buffer!.getEvents()

    // Should have aggregated into one event with count
    const observationEvents = events.filter((e) => e.type === 'observation')
    expect(observationEvents.length).toBe(1)

    const content = observationEvents[0].content as { text: string }
    expect(content.text).toContain('(x3)')
  })
})

describe('PII sanitization', () => {
  const runId = 'test-sanitize-run'
  const agentId = 'test-agent'

  beforeEach(() => {
    eventBufferRegistry.clear()
    runSecretRegistry.delete(runId)
  })

  it('should redact emails in evidence', async () => {
    const trace = createTraceEmitter(runId, agentId)
    trace.emitObservation('Processing email from user', {
      email: 'john.doe@company.com',
      phone: '555-123-4567',
      creditCard: '4111-1111-1111-1111',
    })
    await new Promise((resolve) => setTimeout(resolve, 600))
    trace.close()

    const buffer = eventBufferRegistry.get(runId)
    const events = buffer!.getEvents()
    const content = events[0].content as { evidence?: Record<string, unknown> }

    const evidenceStr = JSON.stringify(content.evidence)
    expect(evidenceStr).not.toContain('john.doe@company.com')
    expect(evidenceStr).not.toContain('555-123-4567')
    expect(evidenceStr).not.toContain('4111-1111-1111-1111')
    expect(evidenceStr).toContain('[EMAIL]')
    // phone key name triggers [REDACTED] regardless of value
    expect(evidenceStr).toContain('[REDACTED]')
    expect(evidenceStr).toContain('[CREDIT_CARD]')
  })

  it('should redact PII key names', () => {
    const trace = createTraceEmitter(runId, agentId)
    trace.emitAction('Login', {
      username: 'john',
      password: 'supersecret123',
      apiKey: 'sk-abc123xyz789',
    })

    const buffer = eventBufferRegistry.get(runId)
    const events = buffer!.getEvents()
    const content = events[0].content as { args: Record<string, unknown> }

    // username should be preserved (not PII key)
    expect(JSON.stringify(content.args)).toContain('john')
    // password and apiKey should be redacted
    expect(JSON.stringify(content.args)).toContain('[REDACTED]')
  })
})

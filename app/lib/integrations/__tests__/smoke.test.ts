/**
 * Integration smoke tests - verify core integration infrastructure works end-to-end.
 * Uses vi.stubEnv for OAuth URL tests so no real credentials are needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { circuitBreakers, createCircuitBreaker } from '@/lib/middleware/circuit-breaker'

// ---------------------------------------------------------------------------
// Mock push-notifications to avoid VAPID key validation errors
// (google-calendar/tools/write.ts imports it at the top level)
// ---------------------------------------------------------------------------
vi.mock('@/lib/push-notifications', () => ({
  sendApprovalPush: vi.fn().mockResolvedValue(undefined),
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// OAuth URL builders that exist in the codebase:
//   - Slack:       buildSlackAuthUrl    (integrations/slack/client)
//   - Gmail:       buildGmailAuthUrl    (gmail/oauth)
//   - Google Drive: buildDriveAuthUrl    (connectors/drive/oauth)
//   - HubSpot:     NOT EXPORTED (only exchangeCodeForHubSpotTokens)
//   - Google Cal:  NOT EXPORTED (only token exchange in integrations/google-calendar/client)
//   - QuickBooks:  NOT EXPORTED (only exchangeCodeForQuickBooksTokens in integrations/quickbooks/index)
//   - Stripe:      API key auth, no OAuth URL
//   - Twilio:      API key auth, no OAuth URL
// ---------------------------------------------------------------------------

const buildSlackAuthUrl = () =>
  import('@/lib/integrations/slack/client').then(m => m.buildSlackAuthUrl)

const buildGmailAuthUrl = () =>
  import('@/lib/gmail/oauth').then(m => m.buildGmailAuthUrl)

const buildDriveAuthUrl = () =>
  import('@/lib/connectors/drive/oauth').then(m => m.buildDriveAuthUrl)

// ---------------------------------------------------------------------------
// Tool timeouts - import lazily to avoid loading heavy modules
// ---------------------------------------------------------------------------

async function getToolTimeouts(): Promise<Record<string, number>> {
  const mod = await import('@/lib/runtime/streaming-tool-executor')
  return mod.TOOL_TIMEOUTS
}

// ---------------------------------------------------------------------------
// Test: Tool registration smoke - verify every connector file can be imported
// without throwing (side-effect: registers tools in the capability registry)
// ---------------------------------------------------------------------------

describe('Tool registration smoke', () => {
  const connectors = [
    '@/lib/connectors/hubspot',
    '@/lib/connectors/slack',
    '@/lib/connectors/stripe',
    '@/lib/connectors/twilio',
    '@/lib/connectors/quickbooks',
    '@/lib/connectors/drive',
  ]

  for (const connector of connectors) {
    it(`${connector} imports without throwing`, async () => {
      // Should not throw - import side-effect calls registerXxxCapabilities()
      await expect(async () => {
        await import(/* @vite-ignore */ connector)
      }).not.toThrow()
    })
  }

  // Google Calendar imports tools/write.ts which imports push-notifications
  // which requires properly-formatted VAPID keys at module evaluation time.
  // We mock push-notifications globally at the top of this file.
  it('@/lib/connectors/google-calendar imports without throwing', async () => {
    await expect(async () => {
      await import('@/lib/connectors/google-calendar')
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Test: OAuth URL construction - verify redirect URLs are correctly formed
// ---------------------------------------------------------------------------

describe('OAuth URL construction', () => {
  const APP_URL = 'https://app.example.com'
  const STATE = 'test-state-token'

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds Slack OAuth URL with correct structure', async () => {
    vi.stubEnv('SLACK_CLIENT_ID', 'slack-test-client-id')
    const fn = await buildSlackAuthUrl()
    const url = fn(STATE)

    const parsed = new URL(url)
    expect(parsed.origin).toBe('https://slack.com')
    expect(parsed.pathname).toBe('/oauth/v2/authorize')
    expect(parsed.searchParams.get('client_id')).toBe('slack-test-client-id')
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      `${APP_URL}/api/integrations/slack/callback`
    )
    expect(parsed.searchParams.get('state')).toBe(STATE)
    expect(parsed.searchParams.get('scope')).toContain('channels:read')
  })

  it('builds Gmail OAuth URL with correct structure', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'gmail-test-client-id')
    const fn = await buildGmailAuthUrl()
    const url = fn(STATE)

    const parsed = new URL(url)
    expect(parsed.origin).toBe('https://accounts.google.com')
    expect(parsed.searchParams.get('client_id')).toBe('gmail-test-client-id')
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      `${APP_URL}/api/auth/gmail/callback`
    )
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('access_type')).toBe('offline')
    expect(parsed.searchParams.get('scope')).toContain('gmail.readonly')
  })

  it('builds Google Drive OAuth URL with correct structure', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'drive-test-client-id')
    const fn = await buildDriveAuthUrl()
    const url = fn(STATE)

    const parsed = new URL(url)
    expect(parsed.origin).toBe('https://accounts.google.com')
    expect(parsed.searchParams.get('client_id')).toBe('drive-test-client-id')
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      `${APP_URL}/api/auth/drive/callback`
    )
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('access_type')).toBe('offline')
    expect(parsed.searchParams.get('scope')).toContain('drive.readonly')
  })
})

// ---------------------------------------------------------------------------
// Test: Partition tool calls - read tools go parallel, write tools go serial
// partitionToolCalls uses isReadTool() which checks:
//   - capabilityRegistry.getToolDef for isConcurrencySafe (slack, stripe)
//   - registry.get for approvalConfig.approverType (hubspot, google-calendar, quickbooks)
// We must import connectors first so the tools are registered
// ---------------------------------------------------------------------------

describe('partitionToolCalls', () => {
  beforeEach(async () => {
    // Import connectors so their tool defs are registered with the capability registry
    await Promise.all([
      import('@/lib/connectors/hubspot'),
      import('@/lib/connectors/google-calendar'),
      import('@/lib/connectors/slack'),
    ])
  })

  it('puts hubspot.contacts.list in readTools (approverType=none)', async () => {
    const { partitionToolCalls } = await import('@/lib/runtime/partition-tool-calls')
    const calls = [{ name: 'hubspot.contacts.list', args: {}, id: '1' }]
    const result = partitionToolCalls(calls as any)
    expect(result.readTools).toHaveLength(1)
    expect(result.writeTools).toHaveLength(0)
  })

  it('puts hubspot.contacts.create in writeTools (approverType=user)', async () => {
    const { partitionToolCalls } = await import('@/lib/runtime/partition-tool-calls')
    const calls = [{ name: 'hubspot.contacts.create', args: {}, id: '2' }]
    const result = partitionToolCalls(calls as any)
    expect(result.writeTools).toHaveLength(1)
    expect(result.readTools).toHaveLength(0)
  })

  it('puts slack.channels.list in readTools (isConcurrencySafe=true)', async () => {
    const { partitionToolCalls } = await import('@/lib/runtime/partition-tool-calls')
    const calls = [{ name: 'slack.channels.list', args: {}, id: '3' }]
    const result = partitionToolCalls(calls as any)
    expect(result.readTools).toHaveLength(1)
    expect(result.writeTools).toHaveLength(0)
  })

  it('puts slack.channel.post in writeTools (isConcurrencySafe=false)', async () => {
    const { partitionToolCalls } = await import('@/lib/runtime/partition-tool-calls')
    const calls = [{ name: 'slack.channel.post', args: {}, id: '4' }]
    const result = partitionToolCalls(calls as any)
    expect(result.writeTools).toHaveLength(1)
    expect(result.readTools).toHaveLength(0)
  })

  it('partitions mixed read + write tools correctly', async () => {
    const { partitionToolCalls } = await import('@/lib/runtime/partition-tool-calls')
    const calls = [
      { name: 'web.search', args: {}, id: '1' },
      { name: 'hubspot.contacts.list', args: {}, id: '2' },
      { name: 'hubspot.contacts.create', args: {}, id: '3' },
      { name: 'slack.channel.post', args: {}, id: '4' },
    ]
    const result = partitionToolCalls(calls as any)
    // web.search + hubspot.contacts.list -> read
    expect(result.readTools).toHaveLength(2)
    // hubspot.contacts.create + slack.channel.post -> write
    expect(result.writeTools).toHaveLength(2)
  })

  it('treats unknown tools as write (safe default)', async () => {
    const { partitionToolCalls } = await import('@/lib/runtime/partition-tool-calls')
    const calls = [{ name: 'unknown.tool', args: {}, id: '99' }]
    const result = partitionToolCalls(calls as any)
    expect(result.writeTools).toHaveLength(1)
    expect(result.readTools).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Test: Circuit breakers - verify all new integrations have circuit breakers
// ---------------------------------------------------------------------------

describe('Circuit breaker initialization', () => {
  const expectedIntegrations = ['quickbooks', 'stripe', 'twilio', 'google-calendar']

  for (const name of expectedIntegrations) {
    it(`${name} has a circuit breaker entry`, () => {
      expect(circuitBreakers).toHaveProperty(name)
      const cb = circuitBreakers[name]!
      expect(cb.name).toBe(name)
      expect(cb.state).toBe('closed')
      expect(cb.threshold).toBeGreaterThan(0)
      expect(cb.resetTimeoutMs).toBeGreaterThan(0)
    })
  }

  it('gmail and hubspot circuit breakers exist (Phase 1 integrations)', () => {
    expect(circuitBreakers).toHaveProperty('gmail')
    expect(circuitBreakers).toHaveProperty('hubspot')
  })

  it('createCircuitBreaker produces a closed breaker with correct defaults', () => {
    const cb = createCircuitBreaker('test-service')
    expect(cb.state).toBe('closed')
    expect(cb.failureCount).toBe(0)
    expect(cb.threshold).toBe(3)
    expect(cb.resetTimeoutMs).toBe(30_000)
  })

  it('createCircuitBreaker accepts custom config', () => {
    const cb = createCircuitBreaker('custom', { threshold: 5, resetTimeoutMs: 60_000 })
    expect(cb.threshold).toBe(5)
    expect(cb.resetTimeoutMs).toBe(60_000)
  })
})

// ---------------------------------------------------------------------------
// Test: Tool timeouts - verify all tools have entries in TOOL_TIMEOUTS
// ---------------------------------------------------------------------------

describe('Tool timeouts', () => {
  it('TOOL_TIMEOUTS is exported and non-empty', async () => {
    const timeouts = await getToolTimeouts()
    expect(timeouts).not.toBeNull()
    expect(typeof timeouts).toBe('object')
    expect(Object.keys(timeouts).length).toBeGreaterThan(0)
  })

  it('TOOL_TIMEOUTS includes hubspot tools', async () => {
    const timeouts = await getToolTimeouts()
    expect(timeouts).toHaveProperty('hubspot.contacts.list')
    expect(timeouts).toHaveProperty('hubspot.contacts.search')
    expect(timeouts).toHaveProperty('hubspot.deals.list')
    expect(timeouts).toHaveProperty('hubspot.contacts.create')
    expect(timeouts).toHaveProperty('hubspot.contacts.update')
  })

  it('TOOL_TIMEOUTS includes calendar tools', async () => {
    const timeouts = await getToolTimeouts()
    expect(timeouts).toHaveProperty('calendar.events.create')
    expect(timeouts).toHaveProperty('calendar.events.list')
    expect(timeouts).toHaveProperty('calendar.events.get')
    expect(timeouts).toHaveProperty('calendar.events.update')
    expect(timeouts).toHaveProperty('calendar.events.delete')
    expect(timeouts).toHaveProperty('calendar.availability.get')
  })

  it('TOOL_TIMEOUTS includes stripe tools', async () => {
    const timeouts = await getToolTimeouts()
    expect(timeouts).toHaveProperty('stripe.payments.list')
    expect(timeouts).toHaveProperty('stripe.payments.get')
    expect(timeouts).toHaveProperty('stripe.payment_link.create')
    expect(timeouts).toHaveProperty('stripe.invoices.send')
  })

  it('TOOL_TIMEOUTS includes quickbooks tools', async () => {
    const timeouts = await getToolTimeouts()
    expect(timeouts).toHaveProperty('quickbooks.invoices.list')
    expect(timeouts).toHaveProperty('quickbooks.invoices.get')
    expect(timeouts).toHaveProperty('quickbooks.customers.list')
    expect(timeouts).toHaveProperty('quickbooks.invoices.create')
    expect(timeouts).toHaveProperty('quickbooks.invoices.send')
    expect(timeouts).toHaveProperty('quickbooks.invoices.record_payment')
  })

  it('TOOL_TIMEOUTS includes twilio tools', async () => {
    const timeouts = await getToolTimeouts()
    expect(timeouts).toHaveProperty('twilio.sms.send')
  })

  it('TOOL_TIMEOUTS includes slack tools', async () => {
    const timeouts = await getToolTimeouts()
    expect(timeouts).toHaveProperty('slack.channel.post')
    expect(timeouts).toHaveProperty('slack.channels.list')
    expect(timeouts).toHaveProperty('slack.messages.recent')
  })

  it('TOOL_TIMEOUTS includes web.search', async () => {
    const timeouts = await getToolTimeouts()
    expect(timeouts).toHaveProperty('web.search')
    expect(timeouts['web.search']).toBe(15_000)
  })

  it('all timeout values are positive integers', async () => {
    const timeouts = await getToolTimeouts()
    for (const [tool, ms] of Object.entries(timeouts)) {
      expect(typeof ms).toBe('number')
      expect(ms).toBeGreaterThan(0)
      expect(Number.isInteger(ms)).toBe(true)
    }
  })
})

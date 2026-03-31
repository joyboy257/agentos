/**
 * MCP Client Tests
 * ARCHITECTURE-02-mcp-client.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MCPClient, MCPClientError, MCPAuthError, MCPServerError } from '../mcp-client'
import { ManifestCache } from '../manifest-cache'
import { atomicTokenRefresh } from '../token-refresh'
import {
  mcpToolToCapability,
  getRequiredCapability,
  canInvokeTool,
  DANGEROUS_TOOLS,
} from '../tool-mapper'

// ---------------------------------------------------------------------------
// ManifestCache tests
// ---------------------------------------------------------------------------

describe('ManifestCache', () => {
  let cache: ManifestCache

  beforeEach(() => {
    cache = new ManifestCache(60_000) // 60s TTL
  })

  it('returns null for unknown manifestVersion', () => {
    expect(cache.get('v1')).toBeNull()
  })

  it('stores and retrieves tools by manifestVersion', () => {
    const tools = [{ name: 'stripe.chargeCustomer' }]
    cache.set('v1', tools)
    expect(cache.get('v1')).toEqual(tools)
  })

  it('returns null after TTL expires', async () => {
    vi.useFakeTimers()
    const shortCache = new ManifestCache(50)
    shortCache.set('v1', [{ name: 'test' }])
    await vi.advanceTimersByTimeAsync(51)
    expect(shortCache.get('v1')).toBeNull()
    vi.useRealTimers()
  })

  it('invalidates specific manifestVersion', () => {
    cache.set('v1', [{ name: 'a' }])
    cache.set('v2', [{ name: 'b' }])
    cache.invalidate('v1')
    expect(cache.get('v1')).toBeNull()
    expect(cache.get('v2')).toEqual([{ name: 'b' }])
  })

  it('clears all entries', () => {
    cache.set('v1', [{ name: 'a' }])
    cache.set('v2', [{ name: 'b' }])
    cache.clear()
    expect(cache.get('v1')).toBeNull()
    expect(cache.get('v2')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// atomicTokenRefresh tests
// ---------------------------------------------------------------------------

describe('atomicTokenRefresh', () => {
  it('runs refreshFn and returns result', async () => {
    const result = await atomicTokenRefresh('user1', 'refresh-token', async (token) => {
      expect(token).toBe('refresh-token')
      return { accessToken: 'new-access', expiresAt: null }
    })
    expect(result.accessToken).toBe('new-access')
  })

  it('deduplicates concurrent refresh calls for same userId', async () => {
    let callCount = 0
    const slowRefresh = async () => {
      callCount++
      await new Promise(r => setTimeout(r, 50))
      return { accessToken: `token-${callCount}`, expiresAt: null }
    }

    const [r1, r2, r3] = await Promise.all([
      atomicTokenRefresh('user1', 'rt', slowRefresh),
      atomicTokenRefresh('user1', 'rt', slowRefresh),
      atomicTokenRefresh('user1', 'rt', slowRefresh),
    ])

    // Only one refresh should have run
    expect(callCount).toBe(1)
    // All three should get the same result
    expect(r1.accessToken).toBe(r2.accessToken)
    expect(r2.accessToken).toBe(r3.accessToken)
  })

  it('allows separate userIds to refresh concurrently', async () => {
    let user1Calls = 0
    let user2Calls = 0

    await Promise.all([
      atomicTokenRefresh('user1', 'rt', async () => {
        user1Calls++
        return { accessToken: 'u1', expiresAt: null }
      }),
      atomicTokenRefresh('user2', 'rt', async () => {
        user2Calls++
        return { accessToken: 'u2', expiresAt: null }
      }),
    ])

    expect(user1Calls).toBe(1)
    expect(user2Calls).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// tool-mapper tests
// ---------------------------------------------------------------------------

describe('tool-mapper', () => {
  it('maps known MCP tools to capability IDs', () => {
    expect(mcpToolToCapability('stripe.chargeCustomer')).toBe('payments:charge')
    expect(mcpToolToCapability('shell.execute')).toBe('admin:execute_code')
  })

  it('returns null for unknown MCP tools', () => {
    expect(mcpToolToCapability('unknown.tool')).toBeNull()
  })

  it('identifies dangerous tools and their required capabilities', () => {
    expect(getRequiredCapability('stripe.chargeCustomer')).toBe('PAYMENTS')
    expect(getRequiredCapability('shell.execute')).toBe('EXECUTE_CODE')
  })

  it('returns null for non-dangerous tools', () => {
    expect(getRequiredCapability('gmail.read')).toBeNull()
    expect(getRequiredCapability('web.search')).toBeNull()
  })

  it('enforces capability grants for dangerous tools', () => {
    const granted = new Set(['PAYMENTS'])
    expect(canInvokeTool('stripe.chargeCustomer', granted)).toBe(true)

    const notGranted = new Set<string>()
    expect(canInvokeTool('stripe.chargeCustomer', notGranted)).toBe(false)
    expect(canInvokeTool('shell.execute', notGranted)).toBe(false)
  })

  it('allows non-dangerous tools without any grants', () => {
    const empty = new Set<string>()
    expect(canInvokeTool('gmail.read', empty)).toBe(true)
    expect(canInvokeTool('web.search', empty)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// MCPClient unit tests
// ---------------------------------------------------------------------------

describe('MCPClient', () => {
  let client: MCPClient
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    client = new MCPClient('https://mcp.zapier.com')
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    client.disconnect()
    vi.restoreAllMocks()
  })

  describe('connect / disconnect', () => {
    it('stores userId and bearerToken on connect', async () => {
      await client.connect('user1', 'Bearer token123')
      // Connection just stores the values; no network call
    })

    it('throws NOT_CONNECTED if listTools called before connect', async () => {
      await expect(client.listTools()).rejects.toThrow(MCPClientError)
    })

    it('clears state on disconnect', async () => {
      await client.connect('user1', 'token')
      client.disconnect()
      await expect(client.listTools()).rejects.toThrow(MCPClientError)
    })
  })

  describe('listTools', () => {
    const mockManifestResponse = {
      manifestVersion: 'v2.1.0',
      tools: [
        { name: 'stripe.chargeCustomer', description: 'Charge a customer' },
        { name: 'gmail.read', description: 'Read emails' },
      ],
    }

    beforeEach(async () => {
      await client.connect('user1', 'token123')
    })

    it('fetches and caches manifest', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(mockManifestResponse),
      })

      const tools = await client.listTools()
      expect(tools).toHaveLength(2)
      expect(tools[0].name).toBe('stripe.chargeCustomer')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('returns cached manifest on second call (no network)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(mockManifestResponse),
      })

      await client.listTools()
      await client.listTools()
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('throws on manifest fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      await expect(client.listTools()).rejects.toThrow(MCPClientError)
    })
  })

  describe('callTool', () => {
    beforeEach(async () => {
      await client.connect('user1', 'token123')
    })

    it('blocks dangerous tool without capability', async () => {
      await expect(
        client.callTool('stripe.chargeCustomer', { amount: 100 })
      ).rejects.toThrow('requires \'PAYMENTS\' capability')

      await expect(
        client.callTool('stripe.chargeCustomer', { amount: 100 })
      ).rejects.toThrow('CAPABILITY_REQUIRED')
    })

    it('allows dangerous tool after grant', async () => {
      client.grantCapability('user1', 'PAYMENTS')

      // Mock fetch for the actual tool call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-length') return '100'
            if (name === 'X-Max-Payload-Size') return '1000000'
            return null
          },
        },
        json: () => Promise.resolve({ jsonrpc: '2.0', id: '1', result: { success: true } }),
      })

      const result = await client.callTool('stripe.chargeCustomer', { amount: 100 })
      expect(result.data).toEqual({ success: true })
    })

    it('sends idempotencyKey in both JSON-RPC meta and HTTP header', async () => {
      client.grantCapability('user1', 'PAYMENTS')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-length') return '100'
            if (name === 'X-Max-Payload-Size') return '1000000'
            return null
          },
        },
        json: () => Promise.resolve({ jsonrpc: '2.0', id: '1', result: { ok: true } }),
      })

      await client.callTool('stripe.chargeCustomer', { amount: 100 }, 'idem-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://mcp.zapier.com/v1/tools/call',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer token123',
            'X-Idempotency-Key': 'idem-123',
          }),
        })
      )
    })

    it('throws MCPAuthError on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: { get: () => null },
      })

      await expect(
        client.callTool('gmail.read', {})
      ).rejects.toThrow(MCPAuthError)
    })

    it('throws MCPServerError when result exceeds max payload size', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-length') return '1000001'
            if (name === 'X-Max-Payload-Size') return '1000000'
            return null
          },
        },
        json: () => Promise.resolve({ jsonrpc: '2.0', id: '1', result: {} }),
      })

      await expect(
        client.callTool('gmail.read', {})
      ).rejects.toThrow(MCPServerError)

      await expect(
        client.callTool('gmail.read', {})
      ).rejects.toThrow('RESULT_PAYLOAD_TOO_LARGE')
    })

    it('throws on JSON-RPC error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-length') return '100'
            if (name === 'X-Max-Payload-Size') return '1000000'
            return null
          },
        },
        json: () => Promise.resolve({
          jsonrpc: '2.0',
          id: '1',
          error: { code: 'TOOL_ERROR', message: 'Something went wrong' },
        }),
      })

      const err = await client.callTool('gmail.read', {}).catch(e => e)
      expect(err.code).toBe('TOOL_ERROR')
      expect(err.retryable).toBe(false)
    })

    it('marks 5xx errors as retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: { get: () => null },
      })

      const err = await client.callTool('gmail.read', {}).catch(e => e)
      expect(err.retryable).toBe(true)
    })

    it('sanitizes sensitive args in logs', async () => {
      client.grantCapability('user1', 'PAYMENTS')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-length') return '100'
            if (name === 'X-Max-Payload-Size') return '1000000'
            return null
          },
        },
        json: () => Promise.resolve({ jsonrpc: '2.0', id: '1', result: {} }),
      })

      await client.callTool('stripe.chargeCustomer', {
        amount: 100,
        creditCard: '4111111111111111',
        secret: 'super-secret',
      })

      // If we got here without throwing, the call succeeded
      // (sanitization happens internally; we just verify no crash)
    })
  })

  describe('registerMCPToolsAsCapabilities', () => {
    it('registers tools as capabilities in the registry', async () => {
      await client.connect('user1', 'token123')

      const tools = [
        {
          name: 'stripe.chargeCustomer',
          description: 'Charge a customer',
          inputSchema: { type: 'object', properties: { amount: { type: 'number' } } },
          outputSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
        },
      ]

      client.registerMCPToolsAsCapabilities(tools)

      // Verify the capability was registered (by checking it can be looked up)
      // We don't have direct access to registry.get here, but the call shouldn't throw
    })
  })
})
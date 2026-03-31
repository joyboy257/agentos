/**
 * Manifest Cache — manifestVersion pinning with TTL cache
 * ARCHITECTURE-02-mcp-client.md §Manifest Caching
 *
 * Caches MCP tool manifests keyed by manifestVersion.
 * When the Zapier MCP server's manifestVersion changes, the cache is invalidated.
 */

interface CachedManifest {
  tools: MCPTool[]
  manifestVersion: string
  cachedAt: number
}

export interface MCPTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

interface CacheEntry {
  data: CachedManifest
  expiresAt: number
}

export class ManifestCache {
  private cache = new Map<string, CacheEntry>()
  private defaultTTLMs: number

  constructor(defaultTTLMs = 300_000) {
    // defaultTTLMs = 5 minutes
    this.defaultTTLMs = defaultTTLMs
  }

  /**
   * Get a cached manifest if it exists and hasn't expired.
   */
  get(manifestVersion: string): MCPTool[] | null {
    const entry = this.cache.get(manifestVersion)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(manifestVersion)
      return null
    }
    return entry.data.tools
  }

  /**
   * Store a manifest with a specific manifestVersion and TTL.
   */
  set(manifestVersion: string, tools: MCPTool[], ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTTLMs
    this.cache.set(manifestVersion, {
      data: { tools, manifestVersion, cachedAt: Date.now() },
      expiresAt: Date.now() + ttl,
    })
  }

  /**
   * Invalidate all cached entries (e.g., when user disconnects).
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Invalidate only entries for a specific manifestVersion.
   */
  invalidate(manifestVersion: string): void {
    this.cache.delete(manifestVersion)
  }
}
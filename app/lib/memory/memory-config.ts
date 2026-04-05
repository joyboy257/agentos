/**
 * Memory configuration and environment validation.
 *
 * Checks for required env vars: MEM0_API_KEY, QDRANT_CLOUD_URL, QDRANT_API_KEY.
 * Throws at startup if keys are missing.
 * Graceful degradation: if keys are absent, memory operations are no-ops
 * (log a warning but don't throw), allowing the app to function without memory.
 */

const REQUIRED_ENV_VARS = ['MEM0_API_KEY', 'QDRANT_CLOUD_URL', 'QDRANT_API_KEY'] as const;

export interface MemoryConfig {
  mem0ApiKey: string;
  qdrantCloudUrl: string;
  qdrantApiKey: string;
  isConfigured: boolean;
}

let cachedConfig: MemoryConfig | null = null;

/**
 * Returns the memory configuration.
 *
 * - If all env vars are present: returns full config with isConfigured = true.
 * - If any env var is missing: returns config with isConfigured = false
 *   and individual fields set to empty strings.
 *
 * Callers should check config.isConfigured before attempting memory operations.
 * When isConfigured is false, all memory operations are no-ops.
 */
export function getMemoryConfig(): MemoryConfig {
  if (cachedConfig) return cachedConfig;

  const mem0ApiKey = process.env.MEM0_API_KEY ?? '';
  const qdrantCloudUrl = process.env.QDRANT_CLOUD_URL ?? '';
  const qdrantApiKey = process.env.QDRANT_API_KEY ?? '';

  const isConfigured =
    mem0ApiKey.length > 0 &&
    qdrantCloudUrl.length > 0 &&
    qdrantApiKey.length > 0;

  cachedConfig = { mem0ApiKey, qdrantCloudUrl, qdrantApiKey, isConfigured };
  return cachedConfig;
}

/**
 * Validates that all required memory env vars are present.
 * Throws a clear error listing which vars are missing.
 * Called at startup (e.g., from the memory module entry point).
 */
export function assertMemoryConfig(): void {
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) missing.push(key);
  }
  if (missing.length > 0) {
    throw new Error(
      `[Memory] Missing required environment variables: ${missing.join(', ')}. ` +
        'Memory features will be disabled until these are set. ' +
        'See docs/plans/2026-04-05-008-feat-agentos-phase-2-plan.md §Env Vars.'
    );
  }
}

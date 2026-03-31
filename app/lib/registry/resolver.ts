/**
 * Capability Registry — Cosine Similarity Resolver
 * ARCHITECTURE-01-capability-registry.md §5.2
 *
 * Uses keyword-based cosine similarity over trigger phrases to match
 * user goals against registered capabilities. Threshold ≥ 0.5.
 */

import { Capability, CapabilityMatch, RegistryQuery, ExecutionContext } from './types';

/**
 * Tokenize a phrase for keyword-based similarity scoring.
 * Whitespace-split, lowercased, filtered to tokens >1 char.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 1)
  );
}

/**
 * Compute cosine similarity between two token sets using set overlap:
 * |A ∩ B| / sqrt(|A| * |B|)
 * Equivalent to cosine similarity on one-hot vectors.
 */
function cosineSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set(Array.from(a).filter((x) => b.has(x)));
  if (intersection.size === 0) return 0;
  return intersection.size / Math.sqrt(a.size * b.size);
}

/**
 * Resolve which capabilities match a user goal using cosine similarity
 * on trigger phrases. Returns capabilities with score ≥ 0.5, sorted descending.
 */
export function resolveCapabilities(
  capabilities: Capability[],
  query: RegistryQuery
): CapabilityMatch[] {
  const { goal, context, limit = 5 } = query;
  const goalTokens = tokenize(goal);

  const scored: CapabilityMatch[] = [];

  for (const capability of capabilities) {
    // Skip if already active in plan
    if (context?.activeCapabilities?.includes(capability.id)) {
      continue;
    }

    // Score each trigger against the goal
    const triggerScores = capability.triggers.map((trigger) => ({
      trigger,
      score: cosineSimilarity(tokenize(trigger), goalTokens),
    }));

    // Take the best-scoring trigger
    const best = triggerScores.reduce(
      (a, b) => (a.score > b.score ? a : b),
      { trigger: '', score: 0 }
    );

    // Threshold: cosine similarity ≥ 0.5
    if (best.score >= 0.5) {
      scored.push({
        capability,
        score: best.score,
        matchedTriggers: triggerScores
          .filter((t) => t.score >= 0.5)
          .map((t) => t.trigger),
        inferredInputs: {},
      });
    }
  }

  // Sort by score descending, cap at limit
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Resolve field-level semantic dependencies between capability steps.
 * A step B depends on step A if B's input semanticType matches A's output semanticType.
 *
 * Example:
 *   email:read output  { threadId: { semanticType: "threadId" } }
 *   email:send input  { threadId: { semanticType: "threadId" } }
 *   → email:read → email:send dependency is established
 */
export function resolveDependencies(
  capability: Capability,
  priorCapabilities: Capability[]
): string[] {
  const deps: string[] = [];
  const inputProps = capability.inputSchema.properties ?? {};

  for (const prior of priorCapabilities) {
    const outputProps = prior.outputSchema.properties ?? {};

    // Find if ANY output field semantically matches ANY input field
    for (const [, outSchema] of Object.entries(outputProps)) {
      const outType = outSchema.semanticType ?? '';

      for (const [, inSchema] of Object.entries(inputProps)) {
        const inType = inSchema.semanticType ?? '';
        if (outType && outType === inType) {
          deps.push(prior.id);
          break; // one match is enough
        }
      }
    }
  }

  return Array.from(new Set(deps)); // deduplicate
}

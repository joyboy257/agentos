/**
 * Capability Registry — Input Inference
 * ARCHITECTURE-01-capability-registry.md §5.2 — inferInputs contract
 *
 * IMPORTANT: This is a USER-PROMPT contract, NOT an AI extraction step.
 * When capability inputSchema has missing required fields, the system
 * should prompt the user directly — not attempt to extract values via LLM.
 *
 * This module defines the inferInputs() function which identifies missing
 * required fields and returns MissingField descriptors for the UI to prompt.
 */

import { JSONSchema, MissingField, ExecutionContext } from './types';

/**
 * Given a capability's inputSchema and the user goal, identify which
 * required fields are missing from the execution context.
 *
 * CONTRACTS:
 * - Returns MissingField[] for all required fields not satisfied by context
 * - Does NOT attempt LLM extraction — caller handles user prompting
 * - context.extras carries prior step outputs and user-provided values
 *
 * @param schema      The inputSchema of the capability being queried
 * @param context     ExecutionContext (session state, userId, channel, etc.)
 * @returns           Array of MissingField descriptors for user prompting;
 *                    empty array means all required fields are satisfied
 */
export function inferInputs(
  schema: JSONSchema,
  context?: ExecutionContext
): MissingField[] {
  const sessionState = context?.extras ?? {};
  const missing: MissingField[] = [];

  if (!schema.properties) return missing;

  const required = schema.required ?? [];

  for (const fieldName of required) {
    const fieldSchema = schema.properties[fieldName];
    if (!fieldSchema) continue;

    // Field is satisfied if it exists in session state with a non-null value
    if (fieldName in sessionState && sessionState[fieldName] != null) {
      continue; // already satisfied — carry through
    }

    missing.push({
      name: fieldName,
      description: fieldSchema.description,
      semanticType: fieldSchema.semanticType,
      schema: fieldSchema,
    });
  }

  return missing;
}

/**
 * Check if all required fields for a schema are satisfied by context.
 */
export function hasAllRequiredInputs(
  schema: JSONSchema,
  context?: ExecutionContext
): boolean {
  return inferInputs(schema, context).length === 0;
}

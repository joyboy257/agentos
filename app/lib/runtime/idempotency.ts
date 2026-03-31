import { getCheckpointByToolCallId } from '../db/queries';

export function generateIdempotencyKey(): string {
  // ULID is lexicographically sortable and has enough randomness for unique keys
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let result = '';
  for (let i = 0; i < 26; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export async function isIdempotent(toolCallId: string): Promise<boolean> {
  const existing = await getCheckpointByToolCallId(toolCallId);
  return existing !== null;
}

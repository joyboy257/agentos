-- Instagram Business OAuth migration
-- Stores Instagram OAuth tokens in the generic `credentials` table.
-- The provider column = 'instagram'.
-- No new table needed — uses the existing `credentials` table.

BEGIN;

-- Instagram tokens are stored in the credentials table with provider = 'instagram'.
-- The encrypted_token field stores a JSON object:
-- {
--   accessToken: string,
--   refreshToken?: string,
--   expiresAt?: ISO date string,
--   instagramBusinessAccountId?: string
-- }

-- This migration is intentionally a no-op for schema changes.
-- The credentials table (migration 006) already supports this use case.
-- Unique constraint on (user_id, provider) ensures one Instagram account per user.

COMMIT;

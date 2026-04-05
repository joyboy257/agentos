-- Magic link tokens table for passwordless email auth
-- Supports magic link flow: create on send → validate on click → mark used

BEGIN;

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index on token hash for fast lookups and uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS magic_link_tokens_token_hash_idx ON magic_link_tokens(token_hash);

-- Index for finding tokens by user
CREATE INDEX IF NOT EXISTS magic_link_tokens_user_id_idx ON magic_link_tokens(user_id);

-- Index for finding unexpired unused tokens (most common query)
CREATE INDEX IF NOT EXISTS magic_link_tokens_active_idx ON magic_link_tokens(expires_at) WHERE used_at IS NULL;

COMMIT;

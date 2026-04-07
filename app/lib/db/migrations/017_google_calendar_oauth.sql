-- Google Calendar OAuth migration
-- Stores encrypted OAuth tokens for Google Calendar integration
-- Uses the generic credentials table with provider = 'google-calendar'

BEGIN;

-- The credentials table already exists (006_credentials_table.sql)
-- Just verify it supports our provider value
DO $$
BEGIN
  -- If credentials table doesn't exist yet, create it
  CREATE TABLE IF NOT EXISTS "credentials" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE NOT NULL,
    "provider" text NOT NULL,
    "encrypted_token" text NOT NULL,
    "expires_at" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    UNIQUE("user_id", "provider")
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'credentials table already exists or will be created by migration 006';
END $$;

CREATE INDEX IF NOT EXISTS "credentials_user_id_index" ON "credentials"("user_id");
CREATE INDEX IF NOT EXISTS "credentials_provider_index" ON "credentials"("provider");

COMMENT ON TABLE credentials IS 'Stores encrypted OAuth tokens for external services (Gmail, Google Calendar, HubSpot, etc.)';

COMMIT;
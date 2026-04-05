-- Credentials table migration
-- Stores encrypted OAuth tokens for external services (Gmail, etc.)

BEGIN;

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

CREATE INDEX IF NOT EXISTS "credentials_user_id_index" ON "credentials"("user_id");

COMMIT;

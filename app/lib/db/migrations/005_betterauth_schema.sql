-- BetterAuth schema migration
-- Creates: users, sessions, accounts, verification_tokens tables

BEGIN;

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text,
  "email" text UNIQUE NOT NULL,
  "email_verified" boolean DEFAULT false,
  "image" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "token" text UNIQUE NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sessions_token_index" ON "sessions"("token");
CREATE INDEX IF NOT EXISTS "sessions_user_id_index" ON "sessions"("user_id");

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamptz,
  "refresh_token_expires_at" timestamptz,
  "scope" text,
  "password" text,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  UNIQUE("provider_id", "account_id")
);

CREATE INDEX IF NOT EXISTS "accounts_user_id_index" ON "accounts"("user_id");

CREATE TABLE IF NOT EXISTS "verification_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "token" text UNIQUE NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  UNIQUE("identifier", "token")
);

COMMIT;

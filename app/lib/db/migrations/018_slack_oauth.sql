-- Slack OAuth migration
-- The `credentials` table already supports any provider via (user_id, provider) unique constraint.
-- This migration is a no-op placeholder to document the Slack integration.
-- Token storage: encrypted bot token stored in credentials table with provider = 'slack'

BEGIN;

-- Verify credentials table exists and supports slack as provider
-- (table was created in 006_credentials_table.sql)
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'credentials'
  ), 'credentials table not found';
END $$;

COMMIT;
